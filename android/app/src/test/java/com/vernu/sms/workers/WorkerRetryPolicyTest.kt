package com.vernu.sms.workers

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WorkerRetryPolicyTest {
    @Test
    fun retriesNetworkErrors() {
        assertTrue(WorkerRetryPolicy.shouldRetry(null, 0))
    }

    @Test
    fun retriesTransientResponses() {
        listOf(408, 429, 500, 502, 503).forEach {
            assertTrue("code $it", WorkerRetryPolicy.shouldRetry(it, 0))
        }
    }

    @Test
    fun doesNotRetryPermanentClientErrors() {
        listOf(400, 401, 403, 404, 422).forEach {
            assertFalse("code $it", WorkerRetryPolicy.shouldRetry(it, 0))
        }
    }

    @Test
    fun stopsAfterMaxAttempts() {
        val lastAllowedRetry = WorkerRetryPolicy.MAX_ATTEMPTS - 2
        assertTrue(WorkerRetryPolicy.shouldRetry(500, lastAllowedRetry))
        assertFalse(WorkerRetryPolicy.shouldRetry(500, lastAllowedRetry + 1))
        assertFalse(WorkerRetryPolicy.shouldRetry(null, lastAllowedRetry + 1))
    }
}
