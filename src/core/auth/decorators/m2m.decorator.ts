import { SetMetadata } from '@nestjs/common';

export const IS_M2M_KEY = 'isM2M';
export const M2M = () => SetMetadata(IS_M2M_KEY, true);
