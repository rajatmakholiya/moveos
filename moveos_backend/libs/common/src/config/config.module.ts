import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './env.validation';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.ENV_FILE ? [process.env.ENV_FILE, '.env'] : ['.env'],
      validate: validateEnv,
    }),
  ],
})
export class AppConfigModule {}
