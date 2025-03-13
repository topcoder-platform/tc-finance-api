## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter pack.

## Project setup

```bash
$ pnpm install
```

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Database setup
[Prisma](https://www.prisma.io/docs/getting-started) is used to handle DB communication & data migration.
To run a local copy of the database, make sure to copy the contents of ".env.sample" into ".env", and setup your db credentials.
Afterwards, you can just run "npx prisma migrate dev". This will create all the necessary tables in the db.
If you don't have a local setup for postgres, you can use docker to stand up on. Run "docker-compose up -d".
