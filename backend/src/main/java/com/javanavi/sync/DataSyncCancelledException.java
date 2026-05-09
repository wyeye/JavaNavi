package com.javanavi.sync;

public class DataSyncCancelledException extends RuntimeException {
    public DataSyncCancelledException(String jobId) {
        super("Data sync cancelled: " + jobId);
    }
}
