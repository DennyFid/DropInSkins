package com.example.dropinskins.data

import androidx.room.*
import com.example.dropinskins.data.model.*
import kotlinx.coroutines.flow.Flow

@Dao
interface SkinsDao {
    @Insert
    suspend fun insertGroup(group: Group): Long

    @Query("SELECT * FROM groups")
    fun getAllGroups(): Flow<List<Group>>

    @Insert
    suspend fun insertParticipant(participant: Participant): Long

    @Query("SELECT * FROM participants WHERE roundId = :roundId")
    fun getParticipantsForRound(roundId: Long): Flow<List<Participant>>

    @Update
    suspend fun updateParticipant(participant: Participant)

    @Insert
    suspend fun insertRound(round: Round): Long

    @Query("SELECT * FROM rounds WHERE isCompleted = 0 LIMIT 1")
    fun getActiveRound(): Flow<Round?>

    @Query("SELECT * FROM rounds ORDER BY date DESC")
    fun getAllRounds(): Flow<List<Round>>

    @Insert
    suspend fun insertHoleResult(holeResult: HoleResult)

    @Query("SELECT * FROM hole_results WHERE roundId = :roundId")
    fun getHoleResults(roundId: Long): Flow<List<HoleResult>>

    @Insert
    suspend fun insertCarryover(carryover: Carryover)

    @Query("SELECT * FROM carryovers WHERE roundId = :roundId")
    fun getCarryovers(roundId: Long): Flow<List<Carryover>>

    @Delete
    suspend fun deleteCarryover(carryover: Carryover)
}

@Database(entities = [Group::class, Participant::class, Round::class, HoleResult::class, Carryover::class], version = 1)
@TypeConverters(Converters::class)
abstract class AppDatabase : RoomDatabase() {
    abstract fun skinsDao(): SkinsDao
}
