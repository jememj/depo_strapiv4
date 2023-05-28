const utils = require("@strapi/utils");
const { getService } = require("../users-permissions/utils");
const jwt = require("jsonwebtoken");
const _ = require("lodash");
const {
  validateCallbackBody,
} = require("../users-permissions/controllers/validation/auth");

const { setMaxListeners } = require("process");
const { sanitize } = utils;
const { ApplicationError, ValidationError } = utils.errors;
const sanitizeUser = (user, ctx) => {
  const { auth } = ctx.state;
  const userSchema = strapi.getModel("plugin::users-permissions.user");
  return sanitize.contentAPI.output(user, userSchema, { auth });
};

// issue a JWT
const issueJWT = (payload, jwtOptions = {}) => {
  _.defaults(jwtOptions, strapi.config.get("plugin.users-permissions.jwt"));
  return jwt.sign(
    _.clone(payload.toJSON ? payload.toJSON() : payload),
    strapi.config.get("plugin.users-permissions.jwtSecret"),
    jwtOptions
  );
};

// verify the refreshToken by using the REFRESH_SECRET from the .env
const verifyRefreshToken = (token) => {
  return new Promise(function (resolve, reject) {
    jwt.verify(
      token,
      process.env.REFRESH_SECRET,
      {},
      function (err, tokenPayload = {}) {
        if (err) {
          return reject(new Error("Invalid token."));
        }
        resolve(tokenPayload);
      }
    );
  });
};

// issue a Refresh token
const issueRefreshToken = (payload, jwtOptions = {}) => {
  _.defaults(jwtOptions, strapi.config.get("plugin.users-permissions.jwt"));
  return jwt.sign(
    _.clone(payload.toJSON ? payload.toJSON() : payload),
    process.env.REFRESH_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRES }
  );
};

module.exports = (plugin) => {
  plugin.controllers.auth.callback = async (ctx) => {
    const provider = ctx.params.provider || "local";
    const params = ctx.request.body;
    const store = strapi.store({ type: "plugin", name: "users-permissions" });
    const grantSettings = await store.get({ key: "grant" });
    const grantProvider = provider === "local" ? "email" : provider;
    if (!_.get(grantSettings, [grantProvider, "enabled"])) {
      throw new ApplicationError("This provider is disabled");
    }
    if (provider === "local") {
      await validateCallbackBody(params);
      const { identifier } = params;
      // Check if the user exists.
      const user = await strapi
        .query("plugin::users-permissions.user")
        .findOne({
          where: {
            provider,
            $or: [
              { email: identifier.toLowerCase() },
              { username: identifier },
            ],
          },
        });
      if (!user) {
        throw new ValidationError("Invalid identifier or password");
      }
      if (!user.password) {
        throw new ValidationError("Invalid identifier or password");
      }
      const validPassword = await getService("user").validatePassword(
        params.password,
        user.password
      );
      if (!validPassword) {
        throw new ValidationError("Invalid identifier or password");
      } else {
        const refreshToken = issueRefreshToken({ id: user.id });
        ctx.refreshToken = refreshToken;
        ctx.send({
          status: "Authenticated",
          jwt: issueJWT(
            { id: user.id },
            { expiresIn: process.env.JWT_SECRET_EXPIRES }
          ),
          user: await sanitizeUser(user, ctx),
          refreshToken: refreshToken,
        });
      }
      const advancedSettings = await store.get({ key: "advanced" });
      const requiresConfirmation = _.get(
        advancedSettings,
        "email_confirmation"
      );
      if (requiresConfirmation && user.confirmed !== true) {
        throw new ApplicationError("Your account email is not confirmed");
      }
      if (user.blocked === true) {
        throw new ApplicationError(
          "Your account has been blocked by an administrator"
        );
      }
      return ctx.send({
        jwt: getService("jwt").issue({ id: user.id }),
        user: await sanitizeUser(user, ctx),
        refreshToken: ctx.refreshToken,
      });
    }
    // Connect the user with a third-party provider.
    try {
      const user = await getService("providers").connect(provider, ctx.query);
      return ctx.send({
        jwt: getService("jwt").issue({ id: user.id }),
        user: await sanitizeUser(user, ctx),
        refreshToken: ctx.refreshToken,
      });
    } catch (error) {
      throw new ApplicationError(error.message);
    }
  };
  plugin.controllers.auth["refreshToken"] = async (ctx) => {
    const store = await strapi.store({
      type: "plugin",
      name: "users-permissions",
    });
    const { refreshToken } = ctx.request.body;

    if (!refreshToken) {
      return ctx.badRequest("No Authorization");
    }
    try {
      const obj = await verifyRefreshToken(refreshToken);
      const user = await strapi
        .query("plugin::users-permissions.user")
        .findOne({ where: { id: obj.id } });
      if (!user) {
        throw new ValidationError("Invalid identifier or password");
      }
      if (
        _.get(await store.get({ key: "advanced" }), "email_confirmation") &&
        user.confirmed !== true
      ) {
        throw new ApplicationError("Your account email is not confirmed");
      }
      if (user.blocked === true) {
        throw new ApplicationError(
          "Your account has been blocked by an administrator"
        );
      }
      const newRefreshToken = issueRefreshToken({ id: user.id });
      ctx.send({
        jwt: issueJWT(
          { id: obj.id },
          { expiresIn: process.env.JWT_SECRET_EXPIRES }
        ),
        refreshToken: newRefreshToken,
      });
    } catch (err) {
      return ctx.badRequest(err.toString());
    }
  };
  plugin.routes["content-api"].routes.push({
    method: "POST",
    path: "/token/refresh",
    handler: "auth.refreshToken",
    config: {
      policies: [],
      prefix: "",
    },
  });

  plugin.controllers.user.addToFav = async (ctx) => {
    let user = await strapi.query("plugin::users-permissions.user").findOne({
      where: { id: ctx.state.user.id },
      populate: ["favoritesPosts"],
    });
    let post = await strapi
      .query("api::post.post")
      .findOne({ where: { id: ctx.request.body.data } });
    await strapi
      .query("plugin::users-permissions.user")
      .update({
        where: { id: ctx.state.user.id },
        data: { favoritesPosts: [...user.favoritesPosts, post] },
      })
      .then(() => {
        ctx.send([...user.favoritesPosts, post]);
        ctx.response.status = 200;
      });
  };

  plugin.routes["content-api"].routes.push({
    method: "PUT",
    path: "/users/:user/addToFav",
    handler: "user.addToFav",
    config: {
      prefix: "",
      policies: [],
    },
  });

  plugin.controllers.user.delFav = async (ctx) => {
    let user = await strapi.query("plugin::users-permissions.user").findOne({
      where: { id: ctx.state.user.id },
      populate: ["favoritesPosts"],
    });
    const id = ctx.request.body.id;
    const newList = user.favoritesPosts.filter((i) => {
      i.id != id;
    });
    await strapi
      .query("plugin::users-permissions.user")
      .update({
        where: { id: ctx.state.user.id },
        data: { favoritesPosts: newList },
      })
      .then((res) => {
        ctx.send(newList);
        ctx.response.status = 200;
      });
  };

  plugin.routes["content-api"].routes.push({
    method: "PUT",
    path: "/users/:user/delFav",
    handler: "user.delFav",
    config: {
      prefix: "",
      policies: [],
    },
  });
  return plugin;
};
