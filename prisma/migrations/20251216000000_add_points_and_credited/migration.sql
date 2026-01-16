-- Migration: add POINTS and POINTS_AWARD enums and CREDITED payment status
ALTER TYPE payment_status ADD VALUE 'CREDITED';
ALTER TYPE winnings_category ADD VALUE 'POINTS_AWARD';
ALTER TYPE winnings_type ADD VALUE 'POINTS';
