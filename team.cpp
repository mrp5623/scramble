#include "team.h"
#include <cpr/api.h>
#include <cpr/response.h>
#include "libxml/HTMLparser.h"
#include "libxml/xpath.h"
#include <fstream>
#include <iostream>

const std::string Team::nflTeams[32] = {
    "crd", "atl", "rav", "buf", "car", "chi", "cin", "cle",
    "dal", "den", "det", "gnb", "htx", "clt", "jax", "kan",
    "rai", "sdg", "ram", "mia", "min", "nwe", "nor", "nyg",
    "nyj", "phi", "pit", "sfo", "sea", "tam", "oti", "was"
};

Team::Team(int num) {
    name = "";
    cpr::Header headers = {
        {"User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36"},
        {"Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"},
        {"Accept-Language", "en-US,en;q=0.5"},
        {"Connection", "keep-alive"}
    };
    std::string filename = "team_" + nflTeams[num] + ".html";
    std::string html;
    std::ifstream infile(filename, std::ios::in | std::ios::binary);
    if (infile) {
        html.assign((std::istreambuf_iterator<char>(infile)), std::istreambuf_iterator<char>());
        
    } else {
        cpr::Response response = cpr::Get(cpr::Url{"https://www.pro-football-reference.com/teams/"+nflTeams[num]+"/career-passing.htm"}, headers);
        if (response.status_code != 200) {
            std::cerr << "HTTP error for team " << nflTeams[num] << ": " << response.status_code << std::endl;
            return;
        }
        html = response.text;
        std::ofstream outfile(filename, std::ios::out | std::ios::binary);
        outfile << html;
        
    }
    htmlDocPtr doc = htmlReadMemory(html.c_str(), static_cast<int>(html.length()), nullptr, nullptr, HTML_PARSE_NOWARNING | HTML_PARSE_NOERROR);
    if (!doc) return;
    xmlXPathContextPtr context = xmlXPathNewContext(doc);
    if (!context) {
        xmlFreeDoc(doc);
        return;
    }
    xmlXPathObjectPtr name_html_element = xmlXPathEvalExpression((xmlChar *)"//*[@id='meta']/div[2]/h1/span[1]", context);
    if (name_html_element && name_html_element->nodesetval && name_html_element->nodesetval->nodeNr > 0 && name_html_element->nodesetval->nodeTab[0]) {
        name = std::string(reinterpret_cast<char *>(xmlNodeGetContent(name_html_element->nodesetval->nodeTab[0])));
    }
    xmlXPathFreeObject(name_html_element);

    xmlXPathObjectPtr player_html_elements = xmlXPathEvalExpression((xmlChar *)"//table[@id='passing']//tr//td[@data-stat='player']", context);
    if (player_html_elements && player_html_elements->nodesetval) {
        for (int i = 0; i < player_html_elements->nodesetval->nodeNr; ++i) {
            xmlNodePtr player_html_element = player_html_elements->nodesetval->nodeTab[i];
            xmlXPathSetContextNode(player_html_element, context);
            xmlXPathObjectPtr player_xpath_result = xmlXPathEvalExpression((xmlChar *)".//a", context);
            if (player_xpath_result && player_xpath_result->nodesetval && player_xpath_result->nodesetval->nodeNr > 0) {
                xmlNodePtr pname_html_element = player_xpath_result->nodesetval->nodeTab[0];
                std::string player = std::string(reinterpret_cast<char *>(xmlNodeGetContent(pname_html_element)));
                players.push_back(player);
            }
            xmlXPathFreeObject(player_xpath_result);
        }
    }
    xmlXPathFreeObject(player_html_elements);
    xmlXPathFreeContext(context);
    xmlFreeDoc(doc);
}

std::string Team::getName() const {
    return name;
}

std::vector<std::string> Team::getPlayerList() const {
    return players;
}