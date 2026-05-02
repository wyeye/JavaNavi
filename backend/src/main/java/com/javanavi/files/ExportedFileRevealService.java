package com.javanavi.files;

import com.javanavi.i18n.I18nMessages;
import org.springframework.stereotype.Service;

import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@Service
public class ExportedFileRevealService {
    private static final String DISABLE_ENV = "JAVANAVI_DISABLE_OS_OPEN";
    private static final String DISABLE_PROPERTY = "javanavi.disableOsOpen";

    private final I18nMessages messages;

    public ExportedFileRevealService(I18nMessages messages) {
        this.messages = messages;
    }

    public Map<String, Object> revealFields(Path file) {
        Path target = file.toAbsolutePath().normalize();
        Path directory = target.getParent() == null ? target : target.getParent().toAbsolutePath().normalize();
        RevealResult result = reveal(target, directory);
        return orderedMap(
                "revealed", result.revealed(),
                "revealSelected", result.selected(),
                "revealMethod", result.method(),
                "revealTargetPath", target.toString(),
                "revealDirectory", directory.toString(),
                "revealMessage", result.message()
        );
    }

    private RevealResult reveal(Path file, Path directory) {
        if (isDisabled()) {
            return new RevealResult(
                    false,
                    false,
                    "disabled",
                    messages.message("files.revealExportDisabled", "path", file)
            );
        }

        String lastError = "";
        for (RevealCommand command : revealCommands(file, directory)) {
            try {
                Process process = new ProcessBuilder(command.command())
                        .redirectErrorStream(true)
                        .start();
                boolean exited = process.waitFor(2, TimeUnit.SECONDS);
                if (!exited || process.exitValue() == 0) {
                    String messageCode = command.selected()
                            ? "files.revealedExportFile"
                            : "files.openedExportDirectory";
                    return new RevealResult(
                            true,
                            command.selected(),
                            command.command().get(0),
                            messages.message(messageCode, "path", file, "directory", directory)
                    );
                }
                lastError = command.command().get(0) + " exit=" + process.exitValue();
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                return new RevealResult(
                        false,
                        command.selected(),
                        command.command().get(0),
                        messages.message("files.revealExportInterrupted", "path", file)
                );
            } catch (Exception error) {
                lastError = command.command().get(0) + ": " + error.getMessage();
            }
        }
        String suffix = lastError.isBlank() ? "" : " (" + lastError + ")";
        return new RevealResult(
                false,
                false,
                "",
                messages.message("files.revealExportFailed", "path", file, "directory", directory, "suffix", suffix)
        );
    }

    private static List<RevealCommand> revealCommands(Path file, Path directory) {
        String filePath = file.toString();
        String directoryPath = directory.toString();
        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        if (os.contains("win")) {
            return List.of(new RevealCommand(List.of("explorer.exe", "/select," + filePath), true));
        }
        if (os.contains("mac") || os.contains("darwin")) {
            return List.of(new RevealCommand(List.of("open", "-R", filePath), true));
        }
        return List.of(
                new RevealCommand(List.of(
                        "dbus-send",
                        "--session",
                        "--dest=org.freedesktop.FileManager1",
                        "--type=method_call",
                        "/org/freedesktop/FileManager1",
                        "org.freedesktop.FileManager1.ShowItems",
                        "array:string:" + file.toUri(),
                        "string:"
                ), true),
                new RevealCommand(List.of("xdg-open", directoryPath), false),
                new RevealCommand(List.of("gio", "open", directoryPath), false),
                new RevealCommand(List.of("kde-open5", directoryPath), false),
                new RevealCommand(List.of("kde-open", directoryPath), false)
        );
    }

    private static boolean isDisabled() {
        return truthy(System.getenv(DISABLE_ENV)) || truthy(System.getProperty(DISABLE_PROPERTY));
    }

    private static boolean truthy(String value) {
        String normalized = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        return List.of("1", "true", "yes", "on").contains(normalized);
    }

    private static Map<String, Object> orderedMap(Object... entries) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int index = 0; index + 1 < entries.length; index += 2) {
            map.put(String.valueOf(entries[index]), entries[index + 1]);
        }
        return map;
    }

    private record RevealCommand(List<String> command, boolean selected) {
    }

    private record RevealResult(boolean revealed, boolean selected, String method, String message) {
    }
}
