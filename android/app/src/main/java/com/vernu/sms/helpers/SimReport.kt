package com.vernu.sms.helpers

import com.google.gson.Gson
import com.vernu.sms.dtos.SimUsedDTO

/** The SIM a send went through and why it was picked. Carried through the status pending intents. */
data class SimReport(
    val simUsed: SimUsedDTO? = null,
    val selection: String? = null,
) {
    fun toJson(): String = Gson().toJson(this)

    companion object {
        const val SELECTION_REQUESTED = "requested"
        const val SELECTION_REQUESTED_INVALID_FALLBACK = "requested_invalid_fallback"
        const val SELECTION_APP_PREFERRED = "app_preferred"
        const val SELECTION_SYSTEM_DEFAULT = "system_default"

        // Android sentinels: -1 is INVALID_SUBSCRIPTION_ID, Int.MAX_VALUE is DEFAULT_SUBSCRIPTION_ID
        private const val MAX_SLOT_INDEX = 7

        /** A real subscription id, or null for the sentinels Android uses for "none" and "default". */
        fun usableSubscriptionId(id: Int?): Int? =
            if (id == null || id < 0 || id == Int.MAX_VALUE) null else id

        /** A real slot index, or null for "unknown". */
        fun usableSlotIndex(slot: Int?): Int? =
            if (slot == null || slot < 0 || slot > MAX_SLOT_INDEX) null else slot

        /**
         * Why the send used the SIM it did. A requested id that matched no active
         * SIM is a fallback whatever the device fell back to.
         */
        fun selectionFor(requestedId: Int?, requestedValid: Boolean, preferredValid: Boolean): String = when {
            requestedId != null && requestedValid -> SELECTION_REQUESTED
            requestedId != null -> SELECTION_REQUESTED_INVALID_FALLBACK
            preferredValid -> SELECTION_APP_PREFERRED
            else -> SELECTION_SYSTEM_DEFAULT
        }

        /** Nothing worth sending becomes null, so the upload stays as it was. */
        fun compact(dto: SimUsedDTO?): SimUsedDTO? =
            if (dto == null || dto.isEmpty()) null else dto

        fun fromJson(json: String?): SimReport? {
            if (json.isNullOrBlank()) return null
            return try {
                val parsed = Gson().fromJson(json, SimReport::class.java) ?: return null
                SimReport(compact(parsed.simUsed), parsed.selection)
            } catch (e: Exception) {
                null
            }
        }
    }
}
