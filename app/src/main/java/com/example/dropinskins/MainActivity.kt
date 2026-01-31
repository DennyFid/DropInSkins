package com.example.dropinskins

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.example.dropinskins.ui.screens.*

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            DropInSkinsTheme {
                Surface(color = MaterialTheme.colorScheme.background) {
                    DropInSkinsApp()
                }
            }
        }
    }
}

@Composable
fun DropInSkinsApp() {
    val navController = rememberNavController()
    NavHost(navController = navController, startDestination = "group_setup") {
        composable("group_setup") { PlayerManagementScreen(navController) }
        composable("round_setup") { RoundSetupScreen(navController) }
        composable("scoring") { ScoringScreen(navController) }
        composable("stats") { StatsScreen(navController) }
        composable("history") { HistoryScreen(navController) }
    }
}
