package com.javanavi.jobs;

public interface JobProgressSink {
    void progress(int current, int total, String currentTable, String stage);

    void throwIfCancelled();

    JobProgressSink NOOP = new JobProgressSink() {
        @Override
        public void progress(int current, int total, String currentTable, String stage) {
        }

        @Override
        public void throwIfCancelled() {
        }
    };
}
