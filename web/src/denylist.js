/**
 * Name filtering for the public leaderboard. Best-effort by design: the real backstop
 * is deleting a row from the Supabase dashboard.
 *
 * Two lists, answering two different questions.
 *
 * EXACT catches a name that IS the word. Safe to be generous here -- an exact match
 * cannot collide with a longer legitimate name.
 *
 * SUBSTRINGS catches a slur hidden inside a longer name, and is kept deliberately
 * short. Every substring rule risks rejecting a real person: this is the Scunthorpe
 * problem, and it is not hypothetical. Terms excluded from SUBSTRINGS on purpose,
 * with the name that forced the exclusion:
 *
 *   ASS  -> Assange        CUNT -> Scunthorpe     COCK -> Hancock, Cockburn
 *   DICK -> Dickinson      CUM  -> Cummings       TIT  -> Titsworth
 *   RAPE -> Draper         ANAL -> Canale         SHIT -> Shittu
 *
 * Before adding to SUBSTRINGS, add a real surname containing it to the acceptance
 * test in denylist.test.js. If you cannot find one, the rule is probably safe.
 */
const EXACT = new Set([
  'ANAL', 'ANUS', 'ARSE', 'ASS', 'ASSHOLE', 'BASTARD', 'BITCH', 'BOLLOCKS',
  'BONER', 'BOOB', 'BOOBS', 'CLIT', 'COCK', 'COON', 'CRAP', 'CUM', 'CUNT',
  'DAMN', 'DICK', 'DILDO', 'DYKE', 'FAG', 'FAGGOT', 'FELLATIO', 'FUCK',
  'FUCKER', 'FUCKING', 'GOOK', 'HITLER', 'HOMO', 'JAP', 'JIZZ', 'KIKE', 'KKK',
  'KUNT', 'NAZI', 'NEGRO', 'NIGGA', 'NIGGER', 'PAKI', 'PENIS', 'PISS', 'PORN',
  'PRICK', 'PUSSY', 'QUEER', 'RAPE', 'RAPIST', 'RETARD', 'SCROTUM', 'SEMEN',
  'SEX', 'SHIT', 'SLUT', 'SPIC', 'TARD', 'TESTICLE', 'TIT', 'TITS', 'TRANNY',
  'TURD', 'TWAT', 'VAGINA', 'WANK', 'WANKER', 'WETBACK', 'WHORE', 'WOP',
]);

const SUBSTRINGS = ['FUCK', 'BITCH', 'FAGGOT', 'NIGGER', 'NIGGA', 'RETARD', 'RAPIST'];

/** True when this name must not reach the leaderboard. */
export function isBlockedName(name) {
  const upper = String(name ?? '').toUpperCase();
  if (upper === '') return false;
  if (EXACT.has(upper)) return true;
  return SUBSTRINGS.some((bad) => upper.includes(bad));
}
