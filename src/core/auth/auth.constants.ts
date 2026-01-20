export enum Role {
  PaymentAdmin = 'Payment Admin',
  PaymentEditor = 'Payment Editor',
  PaymentViewer = 'Payment Viewer',
  TaskManager = 'Task Manager',
  ProjectManager = 'Project Manager',
  User = 'Topcoder User',
}

export enum M2mScope {
  ReadPayments = 'read:payments',
  CreatePayments = 'create:payments',
}
