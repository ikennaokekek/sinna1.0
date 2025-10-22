import crypto from 'crypto';

export const hashKey = (k: string) => crypto.createHash('sha256').update(k).digest('hex');


