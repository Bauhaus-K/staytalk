/**
 * Deterministic emergency detection, run before the LLM so that life-safety
 * guidance never depends on model availability. Keep patterns specific: a
 * false positive escalates to staff, which is acceptable; a miss is not.
 */
const PATTERNS: RegExp[] = [
  // English (phrases, not bare words: "fire extinguisher" / "emergency exit" are FAQ topics)
  /\b(there'?s a fire|on fire|a fire (in|at|on)|fire!|smoke (is )?coming|full of smoke|call an ambulance|need an ambulance|it'?s an emergency|medical emergency|unconscious|not breathing|can'?t breathe|heart attack|bleeding (heavily|a lot|badly)|seizure|overdose|collapsed|gas leak|smell(s)? gas|break-?in|intruder|assaulted|call (the )?police)\b/i,
  // Korean
  /(불이 났|불났|화재|연기가|구급차|응급|의식이 없|의식을 잃|숨을 (못|안) 쉬|심장마비|쓰러졌|쓰러져|피가 많이|출혈|가스 (냄새|누출)|경련|발작|도둑|강도|폭행|경찰 불러|살려\s*주세요)/,
  // Japanese
  /(火事|火災|煙が|救急車|意識がない|意識を失|息をしていない|息ができない|心臓発作|倒れ(た|て)|大量に出血|出血が止まらない|ガス漏れ|ガスの臭い|けいれん|痙攣|ひきつけ|泥棒|強盗|暴行|警察を呼|助けて)/,
  // Chinese (simplified + traditional)
  /(着火|失火|火灾|火災|救护车|救護車|昏迷|晕倒|暈倒|不能呼吸|无法呼吸|無法呼吸|心脏病发|心臟病發|大量出血|煤气泄漏|瓦斯外洩|抽搐|痉挛|痙攣|小偷|抢劫|搶劫|报警|報警|救命)/,
];

export function detectEmergency(text: string): boolean {
  return PATTERNS.some((re) => re.test(text));
}
