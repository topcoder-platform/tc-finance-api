export enum MEMBER_FIELDS {
  userId = 'userId',
  handle = 'handle',
  firstName = 'firstName',
  lastName = 'lastName',
  status = 'status',
  email = 'email',
  addresses = 'addresses',
  homeCountryCode = 'homeCountryCode',
  photoURL = 'photoURL',
  competitionCountryCode = 'competitionCountryCode',
  description = 'description',
  tracks = 'tracks',
  maxRating = 'maxRating',
  wins = 'wins',
  createdAt = 'createdAt',
  createdBy = 'createdBy',
  updatedAt = 'updatedAt',
  updatedBy = 'updatedBy',
  skills = 'skills',
  stats = 'stats',
}

export const BASIC_MEMBER_FIELDS = [
  MEMBER_FIELDS.userId,
  MEMBER_FIELDS.handle,
  MEMBER_FIELDS.firstName,
  MEMBER_FIELDS.lastName,
  MEMBER_FIELDS.email,
  MEMBER_FIELDS.addresses,
  MEMBER_FIELDS.homeCountryCode,
];

export interface BasicMemberInfo {
  userId: string;
  handle: string;
  firstName: string;
  lastName: string;
  email: string;
  addresses: any[];
  homeCountryCode: string;
}
