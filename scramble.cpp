#include "scramble.h"
#include <random>
#include <iostream>
#include <algorithm>
#include <cpr/api.h>
#include <cpr/response.h>
#include "libxml/HTMLparser.h"
#include "libxml/xpath.h"

Scramble::Scramble() {
    cpr::Header headers = {
        {"User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36"},
        {"Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"},
        {"Accept-Language", "en-US,en;q=0.5"},
        {"Connection", "keep-alive"}
    };
    cpr::Response response = cpr::Get(cpr::Url{"https://www.pro-football-reference.com/leaders/pass_yds_career.htm"}, headers);
    htmlDocPtr doc = htmlReadMemory(response.text.c_str(), static_cast<int>(response.text.length()), nullptr, nullptr, HTML_PARSE_NOWARNING | HTML_PARSE_NOERROR);
    xmlXPathContextPtr context = xmlXPathNewContext(doc);
    xmlXPathObjectPtr player_html_elements = xmlXPathEvalExpression((xmlChar *)"//table[@id='pass_yds_leaders']//tr", context);
    for (int i = 0; i < player_html_elements->nodesetval->nodeNr; ++i) {
        std::string name = "", yards = "";
        xmlNodePtr player_html_element = player_html_elements->nodesetval->nodeTab[i];
        xmlXPathSetContextNode(player_html_element, context);
        xmlXPathObjectPtr name_xpath_result = xmlXPathEvalExpression((xmlChar *)".//td[@data-stat='player']//a", context);
        if (name_xpath_result && name_xpath_result->nodesetval && name_xpath_result->nodesetval->nodeNr > 0) {
            xmlNodePtr name_html_element = name_xpath_result->nodesetval->nodeTab[0];
            name = std::string(reinterpret_cast<char *>(xmlNodeGetContent(name_html_element)));
        }
        xmlXPathFreeObject(name_xpath_result);
        xmlXPathObjectPtr yards_xpath_result = xmlXPathEvalExpression((xmlChar *)".//td[@data-stat='pass_yds']", context);
        if (yards_xpath_result && yards_xpath_result->nodesetval && yards_xpath_result->nodesetval->nodeNr > 0) {
            xmlNodePtr yards_html_element = yards_xpath_result->nodesetval->nodeTab[0];
            yards = std::string(reinterpret_cast<char *>(xmlNodeGetContent(yards_html_element)));
        }
        xmlXPathFreeObject(yards_xpath_result);
        players[name] = yards;
    }
    xmlXPathFreeObject(player_html_elements);
    xmlXPathFreeContext(context);
    xmlFreeDoc(doc);
}

void Scramble::play() {
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> distrib(0, 31);
    for (int i = 0; i < 20; i++) {
        teamNums.push_back(distrib(gen));
    }
    activeTeam = Team(teamNums[0]);
}

std::pair<bool, std::string> Scramble::checkAns(const std::string& guess) {
    std::vector<std::string> playersList = activeTeam.getPlayerList();
    if (std::find(playersList.begin(), playersList.end(), guess) == playersList.end()) {
        std::cout << "Invalid Guess" << std::endl;
        return {false, "Incorect, Try Again!"};
    } else if (std::find(guessed.begin(), guessed.end(), guess) != guessed.end()) {
        std::cout << "Already Guessed" << std::endl;
        return {false, "Already Guessed, Try Again!"};
    } else {
        guessed.push_back(guess);
        std::cout << "Correct" << std::endl;
        nextTurn();
        return {true, "Correct!"};
    }
}

int Scramble::addYards(const std::string& player) {
    int yards = 5000;
    std::string message ="";
    if (players.find(player) != players.end()) {
        std::string yardsStr = players[player];
        yardsStr.erase(std::remove(yardsStr.begin(), yardsStr.end(), ','), yardsStr.end());
        yards= std::stoi(yardsStr);
    } 
    totalScore += yards;
    return yards;
   
    
}

void Scramble::nextTurn() {
    if (turn<teamNums.size()-1){
        turn++;
        activeTeam = Team(teamNums[turn]);
    }
}


Team Scramble::getActiveTeam() const {
    return activeTeam;
}

int Scramble::getTotalScore() const {
    return totalScore;
}

void Scramble::reset() {
    totalScore = 0;
    teamNums.clear();
    guessed.clear();
    turn = 0;
    
}
