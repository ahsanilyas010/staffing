export const en = {
  applyThanks: 'Thanks for applying to {{role}} at {{entity}}. We will call you shortly to discuss the role.',
  applyReceived: 'Thanks, we have received your application. Our team will be in touch soon.',
  callMissed: 'We tried calling you about the {{role}} position. Please call us back or use this link to schedule a call: {{link}}',
  interviewConfirmed: 'Your interview for {{role}} is confirmed for {{date}} at {{time}}, {{location}}. Please bring a copy of your CNIC and CV.',
  interviewReminder24h: 'Reminder: your interview for {{role}} is tomorrow at {{time}}, {{location}}.',
  interviewReminder2h: 'Reminder: your interview for {{role}} is in 2 hours at {{location}}.',
  noShowReschedule: 'We missed you at your scheduled interview. Would you like to reschedule? {{link}}',
  offerSent: 'Congratulations! You have received an offer for {{role}} at {{entity}}. View and respond: {{link}}',
  offerReminder: 'Reminder: your offer for {{role}} expires soon. Please respond here: {{link}}',
  onboardingInvite: 'Welcome to {{entity}}! Please complete your onboarding here: {{link}}',
  optOut: 'Reply STOP to opt out of future messages.',
} as const

export type CopyKey = keyof typeof en
