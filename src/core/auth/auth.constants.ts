export enum Role {
  Administrator = 'Administrator',
  PaymentAdmin = 'Payment Admin',
  PaymentBaAdmin = 'Payment BA Admin',
  PaymentEditor = 'Payment Editor',
  PaymentViewer = 'Payment Viewer',
  TaskManager = 'Task Manager',
  TalentManager = 'Talent Manager',
  ProjectManager = 'Project Manager',
  User = 'Topcoder User',
}

export enum M2mScope {
  ReadPayments = 'read:payments',
  CreatePayments = 'create:payments',
}
