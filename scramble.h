#pragma once
#include <vector>
#include <string>
#include <unordered_map>
#include "team.h"

class Scramble {
    int totalScore = 0;
    std::vector<int> teamNums;
    std::vector<std::string> guessed;
    std::unordered_map<std::string, std::string> players;
    int turn = 0;
    Team activeTeam = Team(0);
public:
    Scramble();
    void play();
    std::pair<bool, std::string> checkAns(const std::string& guess);
    int addYards(const std::string& player);
    void nextTurn();
    Team getActiveTeam() const;
    int getTotalScore() const;
    void reset();
};