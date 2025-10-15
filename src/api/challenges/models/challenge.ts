export interface Challenge {
  id: string;
  name: string;
  description: string;
  descriptionFormat: string;
  projectId: number;
  typeId: string;
  trackId: string;
  timelineTemplateId: string;
  currentPhaseNames: string[];
  wiproAllowed: boolean;
  tags: string[];
  groups: string[];
  submissionStartDate: string;
  submissionEndDate: string;
  registrationStartDate: string;
  registrationEndDate: string;
  startDate: string;
  status: string;
  createdBy: string;
  updatedBy: string;
  metadata: MetadataItem[];
  phases: ChallengePhase[];
  discussions: Discussion[];
  events: any[]; // You can replace `any` with the appropriate structure if available
  prizeSets: PrizeSet[];
  reviewers: Reviewer[]; // Replace with type if available
  terms: any[]; // Replace with type if available
  skills: Skill[];
  attachments: any[]; // Replace with type if available
  track: string;
  type: string;
  legacy: Legacy;
  billing: Billing;
  task: Task;
  created: string;
  updated: string;
  overview: PrizeOverview;
  winners: Winner[]; // Replace with type if needed
  numOfSubmissions: number;
  numOfCheckpointSubmissions: number;
  numOfRegistrants: number;
}

export interface MetadataItem {
  name: string;
  value: string;
}

export interface ChallengePhase {
  id: string;
  phaseId: string;
  name: string;
  description: string;
  isOpen: boolean;
  duration: number;
  scheduledStartDate: string;
  scheduledEndDate: string;
  predecessor?: string;
  constraints: any[]; // Replace with constraint type if needed
}

export interface Discussion {
  name: string;
  type: string;
  provider: string;
  id: string;
  options: any[]; // Replace with option type if needed
}

export interface PrizeSet {
  type: string;
  prizes: Prize[];
}

export interface Prize {
  type: string;
  value: number;
}

export interface Skill {
  id: string;
  name: string;
  category: SkillCategory;
}

export interface SkillCategory {
  id: string;
  name: string;
}

export interface Legacy {
  reviewType: string;
  confidentialityType: string;
  directProjectId: number;
  isTask: boolean;
  useSchedulingAPI: boolean;
  pureV5Task: boolean;
  pureV5: boolean;
  selfService: boolean;
}

export interface Billing {
  billingAccountId: string;
  markup: number;
  clientBillingRate?: number;
}

export interface Task {
  isTask: boolean;
  isAssigned: boolean;
}

export interface PrizeOverview {
  totalPrizes: number;
  type: string;
}

export interface Winner {
  userId: number;
  handle: string;
  placement: number;
}

export interface Reviewer {
  scorecardId: string;
  isMemberReview: boolean;
  memberReviewerCount?: number;
  baseCoefficient?: number;
  incrementalCoefficient?: number;
  fixedAmount?: number;
  isAIReviewer: boolean;
}

export interface ChallengeResource {
  memberId: string;
  memberHandle: string;
  roleId: string;
}

export interface ResourceRole {
  id: string;
  name: string;
}
