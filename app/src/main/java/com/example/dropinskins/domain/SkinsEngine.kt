package com.example.dropinskins.domain

import com.example.dropinskins.data.model.*

/**
 * Core engine for calculating skins, carryovers, and participant eligibility.
 */
class SkinsEngine {

    /**
     * Calculates the results for a specific hole.
     * @param holeNum The current hole number.
     * @param scores Map of participant name to their score for the hole.
     * @param activeParticipants List of participants active on this hole.
     * @param currentCarryover The carryover amount coming into this hole.
     * @param betAmount The bet amount per hole.
     */
    fun calculateHole(
        holeNum: Int,
        scores: Map<String, Int>,
        activeParticipants: List<Participant>,
        currentCarryover: Double,
        betAmount: Double
    ): HoleOutcome {
        val activeScores = scores.filterKeys { name -> 
            activeParticipants.any { it.name == name && it.isActive(holeNum) } 
        }

        if (activeScores.isEmpty()) return HoleOutcome.NoActivePlayers

        val minScore = activeScores.values.minOrNull() ?: return HoleOutcome.NoActivePlayers
        val winners = activeScores.filterValues { it == minScore }.keys

        return if (winners.size == 1) {
            // One winner - takes the skin + carryover
            HoleOutcome.Winner(
                winnerName = winners.first(),
                amount = betAmount + currentCarryover,
                carryoverCreated = false
            )
        } else {
            // Tie - carryover created
            HoleOutcome.CarryoverCreated(
                amount = betAmount + currentCarryover,
                eligibleNames = activeParticipants.filter { it.isActive(holeNum) }.map { it.name }
            )
        }
    }
}

sealed class HoleOutcome {
    data class Winner(val winnerName: String, val amount: Double, val carryoverCreated: Boolean) : HoleOutcome()
    data class CarryoverCreated(val amount: Double, val eligibleNames: List<String>) : HoleOutcome()
    object NoActivePlayers : HoleOutcome()
}
