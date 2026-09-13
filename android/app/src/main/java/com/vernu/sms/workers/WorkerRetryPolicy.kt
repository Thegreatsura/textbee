package com.vernu.sms.workers

// Retries network errors and transient server responses, up to MAX_ATTEMPTS runs.
object WorkerRetryPolicy {
    const val MAX_ATTEMPTS = 10

    fun shouldRetry(responseCode: Int?, runAttemptCount: Int): Boolean {
        if (runAttemptCount + 1 >= MAX_ATTEMPTS) return false
        if (responseCode == null) return true
        return responseCode == 408 || responseCode == 429 || responseCode >= 500
    }
}
