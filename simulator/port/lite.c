/* Browser driver and demo; GPL-3.0-or-later, WoooLAB, 2026.
 * Menu, widgets and drawing use the astraLauncher Lite sources.
 */
#include "astra-ui-lite/astra_ui_core.h"
#include "astra-ui-lite/astra_ui_item.h"
#include "astra-ui-lite/astra_ui_drawer.h"
#include <stdint.h>
#include <stdbool.h>

u8g2_t u8g2;
static uint32_t ticks;
static bool led = true, inverted = false;
static int16_t contrast = 80;
static void no_op(void) {}
static uint8_t no_bus(u8x8_t *unused, uint8_t msg, uint8_t n, void *data) { return 1; }
uint32_t launcher_get_tick_ms(void) { return ticks; }
void HAL_Delay(uint32_t ms) { ticks += ms; }
void astra_ui_driver_init(void) {
    u8g2_Setup_ssd1306_128x64_noname_f(&u8g2, U8G2_R0, no_bus, no_bus);
    u8g2_SetFontMode(&u8g2, 1);
    u8g2_SetFont(&u8g2, u8g2_font_my_chinese);
    u8g2_ClearBuffer(&u8g2);
}
#include "lite-about.h"
static void message_page(void) {
    oled_set_draw_color(1);
    oled_draw_frame(7,12,114,42);oled_draw_box(7,12,114,12);
    oled_set_draw_color(0);oled_draw_str(11,22,"Hello, world!");
    oled_set_draw_color(1);oled_draw_str(14,39,"Have fun! :p");
    oled_draw_str(14,49,"[ Back to return ]");
}
void sim_init(void) {
    astra_ui_driver_init();
    astra_list_item_t *root = astra_get_root_list();
    astra_list_item_t *settings = astra_new_list_item("Board settings");
    astra_push_item_to_list(root, settings);
    astra_push_item_to_list(root, astra_new_user_item("Hello, world...", no_op, message_page, no_op));
    astra_push_item_to_list(root, astra_new_user_item("About Lite...", about_init, about_page, about_exit));
    // Match the original API order: attach a parent before attaching its children.
    astra_push_item_to_list(settings, astra_new_switch_item("Status LED", &led));
    astra_push_item_to_list(settings, astra_new_switch_item("Invert OLED", &inverted));
    astra_push_item_to_list(settings, astra_new_slider_item("Brightness", &contrast, 5, 20, 100));
    astra_push_item_to_list(settings, astra_new_user_item("Hello, world...", no_op, message_page, no_op));
    // Upstream main initializes the core before adding items; its empty-root
    // astra_init_list dereferences child[0]. Bind after the populated list instead.
    astra_init_list();astra_bind_selector_to_camera(astra_get_selector());
    in_astra = true;
}
void sim_step(uint32_t ms) {
    ticks = ms;
    oled_clear_buffer();
    astra_ui_main_core();
    astra_ui_widget_core();
    oled_set_draw_color(1);
}
void sim_input(int action) {
    if (!astra_exit_animation_finished) return;
    if (action == 0) astra_selector_go_prev_item();
    else if (action == 1) astra_selector_go_next_item();
    else if (action == 2) {
        bool at_root = astra_selector.selected_item->parent->layer == 0;
        bool in_page = astra_selector.selected_item->type == user_item && astra_to_user_item(astra_selector.selected_item)->in_user_item;
        if (!at_root || in_page) astra_selector_exit_current_item();
    } else if (action == 3) astra_selector_jump_to_selected_item();
}
uint8_t *sim_buffer(void) { return u8g2_GetBufferPtr(&u8g2); }
int sim_selected(void) { return astra_selector.selected_index; }
int sim_flags(void) {
    bool editing = astra_selector.selected_item->type == slider_item && astra_to_slider_item(astra_selector.selected_item)->is_confirmed;
    bool busy = editing || !astra_exit_animation_finished || astra_info_bar.is_running || astra_pop_up.is_running || (about_active && ticks-about_started<3600);
    return (led ? 1 : 0) | (inverted ? 2 : 0) | (busy ? 4 : 0) | (!astra_exit_animation_finished ? 16 : 0) | ((contrast & 255) << 8);
}
const char *sim_label(void) { return astra_selector.selected_item->content; }
