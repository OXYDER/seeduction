/**
 * PostgreSQL refuse l'octet 0x00 dans un texte (« invalid byte sequence for encoding UTF8: 0x00 »).
 * Il arrive pourtant dans des noms de .torrent, des chemins de fichiers ou des NFO (CP437 / binaire) :
 * on le retire avant tout enregistrement.
 */
export const stripNul = (v: string): string => v.replace(/\u0000/g, '');

export const stripNulOpt = (v: string | undefined | null): string | undefined => (v == null ? undefined : stripNul(v));
