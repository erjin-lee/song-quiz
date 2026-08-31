import 'reflect-metadata';
import { DataSource } from 'typeorm';

/**
 * typeorm CLI(migration:generate/run/revert/show) 전용 DataSource. app.module.ts의
 * TypeOrmModule.forRoot()와 접속 정보는 동일하게 process.env에서 읽지만(코드가 직접
 * .env를 읽지 않는다 - CLAUDE.md 원칙), autoLoadEntities는 NestJS DI 런타임 전용이라
 * CLI에서는 못 쓰므로 entities를 글롭으로 명시한다.
 */
export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST_NAME,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USER_NAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_AUTH_DB_NAME,
  entities: [`${__dirname}/**/*.entity{.ts,.js}`],
  migrations: [`${__dirname}/migrations/*{.ts,.js}`],
  synchronize: false,
});
