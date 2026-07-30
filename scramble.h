#pragma once
#include <vector>
#include <string>
#include <unordered_map>
#include "team.h"

class Scramble {
    struct TeamData {
        std::string displayName;
        std::vector<std::string> players;
    };
    std::unordered_map<std::string, TeamData> teams;   // code -> data
    std::unordered_map<std::string, int> qbYards;      // qb -> career yards
    std::vector<std::string> teamCodes;                // all franchise codes
    std::vector<std::string> chosen;                   // 25 selected codes
    std::vector<std::string> guessed;                  // globally used QBs
    int totalScore = 0;
    int turn = 0;
    Team activeTeam;
    bool loaded = false;
    std::string loadError;
public:
    Scramble();
    bool isLoaded() const;
    std::string getLoadError() const;
    void play();
    std::pair<bool, std::string> checkAns(const std::string& guess);
    int addYards(const std::string& player);
    void nextTurn();
    Team getActiveTeam() const;
    int getTotalScore() const;
    void reset();
};
