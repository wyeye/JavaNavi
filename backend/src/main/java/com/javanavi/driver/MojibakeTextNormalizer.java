package com.javanavi.driver;

import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CharsetEncoder;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;

final class MojibakeTextNormalizer {
    private static final String DEFAULT_UPLOAD_VERSION = "upload-1.0";

    private MojibakeTextNormalizer() {
    }

    static String normalize(Object value) {
        String text = value == null ? "" : String.valueOf(value).trim();
        if (isKnownDefaultUploadVersionMojibake(text)) {
            return DEFAULT_UPLOAD_VERSION;
        }
        if (!looksLikeUtf8DecodedAsLatin1(text)) {
            return text;
        }
        try {
            CharsetEncoder encoder = StandardCharsets.ISO_8859_1
                    .newEncoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT);
            ByteBuffer bytes = encoder.encode(CharBuffer.wrap(text));
            String repaired = StandardCharsets.UTF_8
                    .newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(bytes)
                    .toString()
                    .trim();
            return isBetterRepair(text, repaired) ? repaired : text;
        } catch (CharacterCodingException ignored) {
            return text;
        }
    }

    private static boolean isKnownDefaultUploadVersionMojibake(String value) {
        return value.equals("ä¸ä¼ -1.0")
                || value.equals("ä¸Šä¼ -1.0")
                || value.equals("ä¸�ä¼ -1.0")
                || value.equals("ä¸�ä¼ -1.0");
    }

    private static boolean looksLikeUtf8DecodedAsLatin1(String value) {
        if (value.isBlank()) {
            return false;
        }
        int suspicious = 0;
        for (int index = 0; index < value.length(); index += 1) {
            char ch = value.charAt(index);
            if ((ch >= 0x00C0 && ch <= 0x00FF) || (ch >= 0x0080 && ch <= 0x009F)) {
                suspicious += 1;
            }
        }
        return suspicious >= 2;
    }

    private static boolean isBetterRepair(String original, String repaired) {
        if (repaired.isBlank() || repaired.equals(original) || repaired.indexOf('\uFFFD') >= 0) {
            return false;
        }
        return readabilityScore(repaired) > readabilityScore(original);
    }

    private static int readabilityScore(String value) {
        int score = 0;
        for (int index = 0; index < value.length(); index += 1) {
            char ch = value.charAt(index);
            if (Character.UnicodeScript.of(ch) == Character.UnicodeScript.HAN) {
                score += 4;
            } else if (Character.isLetterOrDigit(ch)) {
                score += 2;
            } else if (ch == '-' || ch == '_' || ch == '.' || Character.isWhitespace(ch)) {
                score += 1;
            } else if ((ch >= 0x00C0 && ch <= 0x00FF) || (ch >= 0x0080 && ch <= 0x009F)) {
                score -= 3;
            }
        }
        return score;
    }
}
