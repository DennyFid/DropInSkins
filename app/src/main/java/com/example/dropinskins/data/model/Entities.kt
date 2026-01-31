package com.example.dropinskins.data.model

import androidx.room.*

@Entity(tableName = "groups")
data class Group(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "name") val name: String // Unique participant names per group enforced in logic
)

@Entity(tableName = "participants")
data class Participant(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val roundId: Long,
    val name: String,
    val startHole: Int,
    var endHole: Int? = null
) {
    fun isActive(hole: Int): Boolean {
        return hole >= startHole && (endHole == null || hole <= endHole!!)
    }
}

@Entity(tableName = "rounds")
data class Round(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val totalHoles: Int, // 9 or 18
    val betAmount: Double,
    val date: Long = System.currentTimeMillis(),
    val isCompleted: Boolean = false
)

@Entity(tableName = "hole_results")
data class HoleResult(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val roundId: Long,
    val holeNumber: Int,
    val participantScores: Map<String, Int> // Participant Name to Score
)

@Entity(tableName = "carryovers")
data class Carryover(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val roundId: Long,
    val originatingHole: Int,
    val amount: Double,
    val eligibleParticipantNames: List<String> // Names of participants active when carryover originated
)

class Converters {
    @TypeConverter
    fun fromStringMap(value: Map<String, Int>): String = value.entries.joinToString(",") { "${it.key}:${it.value}" }

    @TypeConverter
    fun toStringMap(value: String): Map<String, Int> = if (value.isEmpty()) emptyMap() else value.split(",").associate {
        val (k, v) = it.split(":")
        k to v.toInt()
    }

    @TypeConverter
    fun fromStringList(value: List<String>): String = value.joinToString(",")

    @TypeConverter
    fun toStringList(value: String): List<String> = if (value.isEmpty()) emptyList() else value.split(",")
}
