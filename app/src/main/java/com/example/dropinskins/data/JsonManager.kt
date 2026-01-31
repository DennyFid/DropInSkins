package com.example.dropinskins.data

import com.example.dropinskins.data.model.*
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import java.io.File

data class RoundExport(
    val round: Round,
    val participants: List<Participant>,
    val holeResults: List<HoleResult>,
    val carryovers: List<Carryover>
)

class JsonManager {
    private val gson = Gson()

    fun exportRound(data: RoundExport, file: File) {
        val json = gson.toJson(data)
        file.writeText(json)
    }

    fun importRound(file: File): RoundExport {
        val json = file.readText()
        val type = object : TypeToken<RoundExport>() {}.type
        return gson.fromJson(json, type)
    }
}
