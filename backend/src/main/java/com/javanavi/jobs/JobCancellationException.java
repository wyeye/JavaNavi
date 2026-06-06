package com.javanavi.jobs;

public class JobCancellationException extends RuntimeException {
    public JobCancellationException(String jobId) {
        super("Job cancelled: " + jobId);
    }
}
