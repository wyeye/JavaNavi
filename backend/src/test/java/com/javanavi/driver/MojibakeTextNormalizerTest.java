package com.javanavi.driver;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

class MojibakeTextNormalizerTest {
    @Test
    void repairsUploadVersionDecodedAsLatin1() {
        String mojibake = new String("上传-1.0".getBytes(StandardCharsets.UTF_8), StandardCharsets.ISO_8859_1);

        assertThat(MojibakeTextNormalizer.normalize(mojibake))
                .isEqualTo("上传-1.0");
    }

    @Test
    void repairsKnownLossyDefaultUploadVersionMojibake() {
        assertThat(MojibakeTextNormalizer.normalize("ä¸�ä¼ -1.0"))
                .isEqualTo("上传-1.0");
    }

    @Test
    void keepsAsciiUploadVersionUnchanged() {
        assertThat(MojibakeTextNormalizer.normalize("1.2.3"))
                .isEqualTo("1.2.3");
    }

    @Test
    void keepsLegitimateLatinTextUnchanged() {
        assertThat(MojibakeTextNormalizer.normalize("Café-1.0"))
                .isEqualTo("Café-1.0");
        assertThat(MojibakeTextNormalizer.normalize("Ångström-1.0"))
                .isEqualTo("Ångström-1.0");
    }
}
