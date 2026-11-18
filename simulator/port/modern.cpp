/* Browser HAL and demonstration app; GPL-3.0-or-later, WoooLAB, 2026.
 * Upstream engine retained; two missing bool returns are documented in upstream.json.
 */
#include "astra/ui/launcher.h"
#include <algorithm>
#include <cmath>
#include <cstdint>
#include "modern-boot.h"

static u8g2_t display;
static uint32_t ticks;
static uint8_t no_bus(u8x8_t *, uint8_t, uint8_t, void *) { return 1; }
static int16_t px(float value) { return static_cast<int16_t>(std::round(value)); }

class BrowserHAL final : public HAL {
public:
    void init() override {
        u8g2_Setup_ssd1306_128x64_noname_f(&display, U8G2_R0, no_bus, no_bus);
        u8g2_SetFontMode(&display, 1);
        u8g2_SetFont(&display, u8g2_font_myfont);
        u8g2_ClearBuffer(&display);
    }
    void *_getCanvasBuffer() override { return u8g2_GetBufferPtr(&display); }
    unsigned char _getBufferTileHeight() override { return 8; }
    unsigned char _getBufferTileWidth() override { return 16; }
    void _canvasClear() override { u8g2_ClearBuffer(&display); }
    void _setFont(const unsigned char *font) override { u8g2_SetFont(&display, font); }
    unsigned char _getFontWidth(std::string &text) override { return u8g2_GetUTF8Width(&display, text.c_str()); }
    unsigned char _getFontHeight() override { return u8g2_GetMaxCharHeight(&display); }
    void _setDrawType(unsigned char color) override { u8g2_SetDrawColor(&display, color); }
    void _drawPixel(float x, float y) override { u8g2_DrawPixel(&display, px(x), px(y)); }
    void _drawEnglish(float x, float y, const std::string &text) override { u8g2_DrawStr(&display, px(x), px(y), text.c_str()); }
    void _drawChinese(float x, float y, const std::string &text) override { u8g2_DrawUTF8(&display, px(x), px(y), text.c_str()); }
    void _drawVDottedLine(float x, float y, float h) override {
        for (int i = 0; i < px(h); ++i) if (i % 8 >= 3) u8g2_DrawPixel(&display, px(x), px(y) + i);
    }
    void _drawHDottedLine(float x, float y, float w) override {
        // Split a dash across the edges so the 128-pixel home rule reaches both.
        for (int i = 0; i < px(w); ++i) if ((i + 5) % 8 >= 3) u8g2_DrawPixel(&display, px(x) + i, px(y));
    }
    void _drawVLine(float x, float y, float h) override { u8g2_DrawVLine(&display, px(x), px(y), px(h)); }
    void _drawHLine(float x, float y, float w) override { u8g2_DrawHLine(&display, px(x), px(y), px(w)); }
    void _drawBMP(float x, float y, float w, float h, const unsigned char *bitmap) override {
        u8g2_DrawXBMP(&display, px(x), px(y), px(w), px(h), bitmap);
    }
    void _drawBox(float x, float y, float w, float h) override { u8g2_DrawBox(&display, px(x), px(y), px(w), px(h)); }
    void _drawRBox(float x, float y, float w, float h, float r) override {
        const int16_t left = px(x), top = px(y), width = px(w), height = px(h), radius = px(r);
        u8g2_DrawRBox(&display, left, top, width, height, radius);
        // The radius-1 XOR list selector leaves a 2 x 2 notch at each corner.
        // Fill its inner diagonal dot, sharing the exact rounded raster bounds.
        if (u8g2_GetDrawColor(&display) == 2 && radius == 1 && width > 4 && height > 4) {
            u8g2_DrawPixel(&display, left + 1, top + 1);
            u8g2_DrawPixel(&display, left + width - 2, top + 1);
            u8g2_DrawPixel(&display, left + 1, top + height - 2);
            u8g2_DrawPixel(&display, left + width - 2, top + height - 2);
        }
    }
    void _drawFrame(float x, float y, float w, float h) override { u8g2_DrawFrame(&display, px(x), px(y), px(w), px(h)); }
    void _drawRFrame(float x, float y, float w, float h, float r) override { u8g2_DrawRFrame(&display, px(x), px(y), px(w), px(h), px(r)); }
    unsigned long _millis() override { return ticks; }
    unsigned long _getTick() override { return ticks * 1000; }
    void _delay(unsigned long ms) override { ticks += ms; }
    void _keyScan() override { /* Browser controls call the original selector / launcher APIs. */ }
};

static astra::Launcher *launcher;
static astra::Menu *current;
static astra::CheckBox *status_led;
static astra::CheckBox *invert_oled;
static OriginalBoot boot;
static bool booting = true;

// 30 x 30 XBM icons are demo content, drawn by the upstream Tile renderer.
static std::vector<unsigned char> icon(int type) {
    // Upstream default pictures are solid white. Cut each motif out of that
    // white field instead of drawing a white outline on black.
    std::vector<unsigned char> bitmap(120, 255);
    auto point = [&](int x, int y) { if (x >= 0 && x < 30 && y >= 0 && y < 30) bitmap[y * 4 + x / 8] &= ~(1 << (x % 8)); };
    auto line = [&](int x1, int y1, int x2, int y2) {
        int count = std::max(std::abs(x2 - x1), std::abs(y2 - y1));
        for (int i = 0; i <= count; ++i) point(x1 + (x2 - x1) * i / std::max(count, 1), y1 + (y2 - y1) * i / std::max(count, 1));
    };
    auto box = [&](int x, int y, int w, int h) { line(x,y,x+w,y);line(x,y,x,y+h);line(x+w,y,x+w,y+h);line(x,y+h,x+w,y+h); };
    if (type == 0) {
        box(4,5,21,17);line(10,26,20,26);line(15,22,15,26);
        line(8,10,11,10);line(8,14,11,14);line(8,18,11,18);
        line(15,10,21,10);line(15,14,21,14);line(15,18,21,18);
    } else if (type == 1) {
        for (int x = 7; x <= 23; x += 8) line(x,5,x,25);
        box(4,9,6,5);box(12,18,6,5);box(20,7,6,5);
    } else {
        box(6,3,17,24);line(10,9,19,9);line(10,14,19,14);line(10,19,16,19);
    }
    return bitmap;
}

extern "C" {
void sim_init() {
    HAL::inject(new BrowserHAL());
    auto *root = new astra::Tile("astra UI");
    auto *menus = new astra::List("Explore", icon(0));
    auto *controls = new astra::List("Controls", icon(1));
    auto *about = new astra::List("About", icon(2));
    root->addItem(menus);root->addItem(controls);root->addItem(about);
    auto *nested = new astra::List("Nested menu >");
    menus->addItem(nested);
    for (const char *title : {"Smooth selector", "Camera follows", "Keep scrolling", "One more item", "Back to the top"})
        menus->addItem(new astra::List(title));
    for (const char *title : {"Hello, explorer!", "This is astra UI", "128 x 64 pixels", "Made by WoooLAB"})
        nested->addItem(new astra::List(title));
    bool on = true, off = false;
    status_led = new astra::CheckBox(on);invert_oled = new astra::CheckBox(off);
    controls->addItem(new astra::List("Status LED"), status_led);
    controls->addItem(new astra::List("Invert OLED"), invert_oled);
    for (const char *title : {"astra UI / C++", "128 x 64 OLED", "WoooLAB", "ad astra."})
        about->addItem(new astra::List(title));
    current = root;launcher = new astra::Launcher();launcher->init(root);
}
void sim_step(uint32_t ms) {
    ticks = ms;
    if (booting) {
        if (boot.draw(ms)) return;
        booting = false;HAL::setFont(astra::getUIConfig().mainFont);
    }
    launcher->update();
}
void sim_input(int action) {
    if (booting) { booting = false;HAL::setFont(astra::getUIConfig().mainFont); }
    if (action == 0) launcher->getSelector()->goPreview();
    else if (action == 1) launcher->getSelector()->goNext();
    else if (action == 2) {
        if (current->parent) { auto *parent = current->parent;if (launcher->close()) current = parent; }
    } else if (action == 3 && !current->childMenu.empty()) {
        auto *selected = current->childMenu[current->selectIndex];
        if (!selected->childWidget.empty()) static_cast<astra::CheckBox *>(selected->childWidget[0])->toggle();
        else if (!selected->childMenu.empty() && launcher->open()) current = selected;
    }
}
uint8_t *sim_buffer() { return u8g2_GetBufferPtr(&display); }
int sim_selected() { return current->selectIndex; }
int sim_flags() { return (status_led->value ? 1 : 0) | (invert_oled->value ? 2 : 0) | (booting ? 12 : 0); }
const char *sim_label() { return current->childMenu[current->selectIndex]->title.c_str(); }
}
