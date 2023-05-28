module.exports = ({ env }) => {
  return {
    email: {
      config: {
        service: "google",
        provider: "nodemailer",
        providerOptions: {
          host: "smtp.gmail.com",
          port: env("SMTP_PORT", 465),
          secure: true,
          auth: {
            user: env("SMTP_USERNAME"),
            pass: env("SMTP_PASSWORD"),
          },
          requireTLS: true,
          rejectUnauthorized: true,
          // ... any custom nodemailer options
        },
        settings: {
          defaultFrom: "depo.dstu@gmail.com",
          defaultReplyTo: "depo.dstu@gmail.com",
        },
      },
    },
    "users-permissions": {
      enabled: true,
      config: {
        jwt: {
          expiresIn: "20m",
        },
      },
    },
    "fuzzy-search": {
      enabled: true,
      config: {
        contentTypes: [
          {
            uid: "api::post.post",
            modelName: "post",
            transliterate: true,
            queryConstraints: {
              populate: true,
              where: {
                $and: [
                  {
                    publishedAt: { $notNull: true },
                  },
                ],
              },
            },
            fuzzysortOptions: {
              characterLimit: 300,
              threshold: -600,
              limit: 10,
              keys: [
                {
                  name: "title",
                  weight: 100,
                },
                {
                  name: "description",
                  weight: 50,
                },
                {
                  name: "text",
                  weight: 50,
                },
              ],
            },
          },
          // {
          //   uid: "api::post",
          //   modelName: "post",
          //   fuzzysortOptions: {
          //     characterLimit: 500,
          //     keys: [
          //       {
          //         name: "title",
          //         weight: 200,
          //       },
          //       {
          //         name: "description",
          //         weight: -200,
          //       },
          //     ],
          //   },
          // },
        ],
      },
    },
  };
};
