import { recoverEvidenceJournal, redact } from './lib/eicValidation';
recoverEvidenceJournal(process.argv[2], process.cwd())
  .then(file => console.log(`Recovered and hash-verified local evidence retained at ${file}; no cleanup performed`))
  .catch(error => { console.error(redact(error.message)); process.exitCode = 1; });