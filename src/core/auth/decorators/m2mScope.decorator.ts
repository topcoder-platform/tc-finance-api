import { SetMetadata } from '@nestjs/common';
import { M2mScope } from '../auth.constants';

export const SCOPES_KEY = 'scopes';
export const AllowedM2mScope = (...scopes: M2mScope[]) =>
  SetMetadata(SCOPES_KEY, scopes);
