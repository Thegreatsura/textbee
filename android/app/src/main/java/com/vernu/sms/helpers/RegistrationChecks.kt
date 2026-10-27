package com.vernu.sms.helpers

import android.content.Context
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability

object RegistrationChecks {
    // The dashboard shows device ids as 24-character hex strings.
    private val DEVICE_ID_PATTERN = Regex("^[0-9a-fA-F]{24}$")

    const val INVALID_DEVICE_ID =
        "This Device ID is not valid. A Device ID has 24 characters, only 0-9 and a-f. Copy it from your textbee dashboard."

    const val PUSH_TOKEN_FAILED =
        "Could not connect to Google Play services. Check your internet connection and try again."

    @JvmStatic
    fun isValidDeviceId(id: String): Boolean = DEVICE_ID_PATTERN.matches(id.trim())

    /** Why this phone cannot get push messages, or null when Google Play services is usable. */
    @JvmStatic
    fun playServicesProblem(context: Context): String? = try {
        playServicesMessage(GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context))
    } catch (e: Exception) {
        null
    }

    @JvmStatic
    fun playServicesMessage(status: Int): String? = when (status) {
        ConnectionResult.SUCCESS -> null
        ConnectionResult.SERVICE_VERSION_UPDATE_REQUIRED, ConnectionResult.SERVICE_UPDATING ->
            "Google Play services is out of date on this phone. Update it in the Play Store, then try again."
        ConnectionResult.SERVICE_DISABLED ->
            "Google Play services is turned off on this phone. Turn it on in Settings > Apps, then try again."
        else ->
            "This phone does not have Google Play services. textbee needs it to get messages to send, so it cannot work on this phone."
    }

    /** The message to show when the push token request fails. */
    @JvmStatic
    fun pushTokenFailureMessage(context: Context): String =
        playServicesProblem(context) ?: PUSH_TOKEN_FAILED
}
