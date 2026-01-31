package com.example.dropinskins.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.dropinskins.data.SkinsDao
import com.example.dropinskins.data.model.*
import com.example.dropinskins.domain.HoleOutcome
import com.example.dropinskins.domain.SkinsEngine
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

class ScoringViewModel(
    private val dao: SkinsDao,
    private val engine: SkinsEngine,
    private val roundId: Long
) : ViewModel() {

    private val _currentHole = MutableStateFlow(1)
    val currentHole = _currentHole.asStateFlow()

    val round = dao.getActiveRound().stateIn(viewModelScope, SharingStarted.Lazily, null)
    val participants = dao.getParticipantsForRound(roundId).stateIn(viewModelScope, SharingStarted.Lazily, emptyList())
    val holeResults = dao.getHoleResults(roundId).stateIn(viewModelScope, SharingStarted.Lazily, emptyList())
    val carryovers = dao.getCarryovers(roundId).stateIn(viewModelScope, SharingStarted.Lazily, emptyList())

    fun submitScore(scores: Map<String, Int>) {
        viewModelScope.launch {
            val currentRound = round.value ?: return@launch
            val activeParts = participants.value.filter { it.isActive(_currentHole.value) }
            val currentCO = carryovers.value.find { it.originatingHole < _currentHole.value }?.amount ?: 0.0

            val outcome = engine.calculateHole(
                _currentHole.value,
                scores,
                activeParts,
                currentCO,
                currentRound.betAmount
            )

            when (outcome) {
                is HoleOutcome.Winner -> {
                    // Save hole result and clear any processed carryover
                    dao.insertHoleResult(HoleResult(roundId = roundId, holeNumber = _currentHole.value, participantScores = scores))
                    // Logic to clear carryover once won
                }
                is HoleOutcome.CarryoverCreated -> {
                    dao.insertHoleResult(HoleResult(roundId = roundId, holeNumber = _currentHole.value, participantScores = scores))
                    dao.insertCarryover(Carryover(
                        roundId = roundId,
                        originatingHole = _currentHole.value,
                        amount = outcome.amount,
                        eligibleParticipantNames = outcome.eligibleNames
                    ))
                }
                HoleOutcome.NoActivePlayers -> { /* Handle error */ }
            }
            
            if (_currentHole.value < currentRound.totalHoles) {
                _currentHole.value++
            }
        }
    }
}
