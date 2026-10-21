package com.vernu.sms.dtos

// The SIM one message went through. Every field is nullable and Gson omits
// nulls, so an unknown part is simply absent from the report.
class SimUsedDTO {
    var subscriptionId: Int? = null
    var slotIndex: Int? = null
    var carrierName: String? = null
    var displayName: String? = null
    var countryIso: String? = null
    var mcc: String? = null
    var mnc: String? = null

    fun isEmpty(): Boolean =
        subscriptionId == null && slotIndex == null && carrierName == null &&
            displayName == null && countryIso == null && mcc == null && mnc == null
}
