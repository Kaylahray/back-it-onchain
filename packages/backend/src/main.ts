import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ValidationError } from 'class-validator';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  // rawBody is required so the indexer webhook route can verify the
  // HMAC-SHA256 X-Signature header against the exact bytes that were sent,
  // rather than a re-serialized (and potentially non-identical) JSON body.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim())
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];
  app.enableCors({ origin: allowedOrigins });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      exceptionFactory: (errors: ValidationError[]) =>
        new BadRequestException({
          title: 'Bad Request',
          detail: 'One or more validation errors occurred.',
          violations: flattenValidationErrors(errors),
        }),
    }),
  );
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap().catch((err) => console.error(err));

function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): Array<{ field: string; message: string }> {
  return errors.flatMap((error) => {
    const field = parentPath ? `${parentPath}.${error.property}` : error.property;
    const constraintMessages = Object.values(error.constraints ?? {}).map((message) => ({
      field,
      message,
    }));
    const childMessages = flattenValidationErrors(error.children ?? [], field);

    return [...constraintMessages, ...childMessages];
  });
}
