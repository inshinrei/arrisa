/** Bidi character types (UAX #9 class subset). */
export const enum T {
    L = 1, // Left-to-Right
    R = 2, // Right-to-Left
    AL = 4, // Right-to-Left Arabic
    EN = 8, // European Number
    AN = 16, // Arabic Number
    ET = 64, // European Number Terminator
    CS = 128, // Common Number Separator
    NI = 256, // Neutral or Isolate (BN, N, WS),
    NSM = 512, // Non-spacing Mark
    Strong = T.L | T.R | T.AL,
    Num = T.EN | T.AN,
}

/** Decode a string with each type encoded as log2(type). */
function dec(str: string): readonly T[] {
    let result = []
    for (let i = 0; i < str.length; i++) result.push(1 << +str[i])
    return result
}

// Character types for codepoints 0 to 0xf8
let LowTypes = dec(
    "88888888888888888888888888888888888666888888787833333333337888888000000000000000000000000008888880000000000000000000000000088888888888888888888888888888888888887866668888088888663380888308888800000000000000000000000800000000000000000000000000000008",
)

// Character types for codepoints 0x600 to 0x6f9
let ArabicTypes = dec(
    "4444448826627288999999999992222222222222222222222222222222222222222222222229999999999999999999994444444444644222822222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222999999949999999229989999223333333333",
)

/** True when the string may contain RTL / Arabic script that needs full bidi. */
export let BidiRE = /[\u0590-\u05f4\u0600-\u06ff\u0700-\u08ac\ufb50-\ufdff]/

/** Map a single code unit to its bidi class (subset of UAX #9). */
export function charType(ch: number): T {
    return ch <= 0xf7
        ? LowTypes[ch]
        : 0x590 <= ch && ch <= 0x5f4
          ? T.R
          : 0x600 <= ch && ch <= 0x6f9
            ? ArabicTypes[ch - 0x600]
            : 0x6ee <= ch && ch <= 0x8ac
              ? T.AL
              : 0x2000 <= ch && ch <= 0x200c
                ? T.NI
                : 0xfb50 <= ch && ch <= 0xfdff
                  ? T.AL
                  : ch == 0xfffc
                    ? T.NI
                    : T.L
}
