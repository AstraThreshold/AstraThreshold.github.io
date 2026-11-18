/* GPL-3.0-or-later, WoooLAB. Cooperative port of astra::drawLogo(1000).
 * The original blocking loop is kept in vendor/modern/Core/Src/astra/astra_logo.cpp.
 * Each browser step draws one frame; the original stars, fonts, targets and
 * exponential movement are preserved. Elapsed time replaces the loop counter.
 */
struct OriginalBoot {
    float background = -65, title = -15, copyright = -9;
    float star_y[16], star_x[16], star_target[16];
    uint32_t previous = 0;
    OriginalBoot() {
        uint32_t seed = 0x41535452;
        for (int i=0;i<16;i++) {
            seed = seed*1664525u+1013904223u;star_x[i] = 1 + ((seed>>8)%58)*2;
            seed = seed*1664525u+1013904223u;star_target[i] = 1 + ((seed>>8)%28)*2;
            star_y[i] = -3;
        }
    }
    bool draw(uint32_t ms) {
        const float elapsed = std::min<uint32_t>(50,ms-previous);previous=ms;
        HAL::canvasClear();
        if (ms < 350) return true; // The original MCU waits 350 ms before its logo.
        const bool exiting = ms >= 1350;
        const float response = 1-std::pow(29.f/30.f,elapsed*240.f/1000.f);
        auto move = [response](float &position,float target) {
            if (std::fabs(position-target)<.15f) position=target;
            else position+=(target-position)*response;
        };
        HAL::setDrawType(0);HAL::drawBox(0,background,128,64);
        move(background,exiting?-65:0);
        HAL::setDrawType(1);HAL::drawHLine(0,background+64,128);
        for (int i=0;i<16;i++) {
            HAL::drawHLine(star_x[i]-3,star_y[i],2);HAL::drawHLine(star_x[i]+2,star_y[i],2);
            HAL::drawVLine(star_x[i],star_y[i]-3,2);HAL::drawVLine(star_x[i],star_y[i]+2,2);
            move(star_y[i],exiting?-3:star_target[i]);
        }
        std::string text="astra UI", credit="powered by";
        HAL::setFont(astra::getUIConfig().logoTitleFont);
        HAL::drawEnglish((128-HAL::getFontWidth(text))/2,title+14,text);
        HAL::setFont(astra::getUIConfig().logoCopyRightFont);
        HAL::drawEnglish((128-HAL::getFontWidth(credit))/2,copyright+8,credit);
        move(title,exiting?-15:25);move(copyright,exiting?-9:13);
        return !exiting || background!=-65;
    }
};
