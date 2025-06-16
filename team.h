#pragma once
#include <string>
#include <vector>

class Team {
    static const std::string nflTeams[32];
    std::string name;
    std::vector<std::string> players;
public:
    explicit Team(int num);
    std::string getName() const;
    std::vector<std::string> getPlayerList() const;
};