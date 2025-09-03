export const roleAccounts = new Set([
  'admin','administrator','postmaster','webmaster','hostmaster','root','support','info','sales','help','billing','abuse','noc','contact','security','hr','careers'
]);

export const disposableDomains = new Set([
  'mailinator.com','guerrillamail.com','10minutemail.com','tempmail.dev','temp-mail.org','yopmail.com','trashmail.com','getnada.com','sharklasers.com','dispostable.com'
]);

export const webmailDomains = new Set([
  'gmail.com','yahoo.com','outlook.com','hotmail.com','live.com','aol.com','icloud.com','mail.com','proton.me','protonmail.com','zoho.com'
]);

export const parkedDomains = new Set([
  'parked-example.com'
]);

export const blacklistDomains = new Set([
  'spamhaus-test.org','barracuda-test.com'
]);

export const spamTrapPatterns = [
  /^trap@/i,
  /^spamtrap@/i,
  /^no-reply@/i,
];

export const knownActiveEmails = new Set([
  'user@gmail.com',
  'info@company.com'
]);

