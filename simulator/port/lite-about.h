/* GPL-3.0-or-later, WoooLAB.
 * Re-enabled copyright-page callbacks from astraLauncher's Core/Src/main.c.
 * Original drawing, integer easing and 300...2400 ms staged entry are retained.
 * The version string matches the owner's supplied v1.0 reference photograph.
 */
#include <math.h>
#include "lite-font-extra.h"
static uint32_t about_started;
static bool about_active;
static int16_t y_logo=200,y_version=200,y_name=-200,y_astra=-200,y_box=200,x_board=-200,y_wire_1=200,y_wire_2=200;
static void about_reset(void) {
    y_logo=200;y_version=200;y_name=-200;y_astra=-200;y_box=200;x_board=-200;y_wire_1=200;y_wire_2=200;
}
static void about_move(int16_t *position,int16_t target,int16_t speed) {
    if (*position!=target) {
        if (fabsf((float)(*position-target))<=1.f) *position=target;
        else *position+=(target-*position)/((100-speed)/1.f);
    }
}
static void about_init(void) { about_reset();about_started=ticks;about_active=true; }
static void about_exit(void) { about_reset();about_started=0;about_active=false; }
static void about_credit(int16_t baseline) {
    const unsigned char *p=(const unsigned char *)"由「astra UI Lite」v1.0";
    int16_t x=2,space_count=2;
    int16_t excess=oled_get_UTF8_width((const char *)p)-124;
    // The supplied font's final glyph overhangs its advance. Tighten only the
    // two word spaces so the v1.0 caption has a complete right edge on 128 px.
    while(*p) {
        uint16_t code=*p++;
        if(code>=0xe0) { code=((code&15)<<12)|((p[0]&63)<<6)|(p[1]&63);p+=2; }
        int16_t width=u8g2_GetGlyphWidth(&u8g2,code);
        u8g2_DrawGlyph(&u8g2,x,baseline,code);
        if(code==' '&&space_count) {
            int16_t trim=excess>0?(excess+space_count-1)/space_count:0;
            if(trim>=width)trim=width-1;
            width-=trim;excess-=trim;space_count--;
        }
        x+=width;
    }
}
static void about_page(void) {
    const uint32_t time=ticks-about_started;
    oled_set_font(u8g2_font_my_chinese);oled_set_draw_color(1);
    oled_draw_R_box(2,y_box-1,oled_get_UTF8_width("「astraLauncher」")+4,oled_get_str_height()+2,1);
    oled_set_draw_color(2);oled_draw_UTF8(4,y_logo-2,"「astraLauncher」");
    oled_set_draw_color(1);oled_draw_str(126-oled_get_str_width("v1.0"),y_version,"v1.0");
    oled_draw_UTF8(2,y_name,"by 无理造物.");
    about_credit(y_astra);draw_lightweight(y_astra+14);oled_draw_UTF8(26,y_astra+14,"驱动.");
    oled_draw_frame(x_board,38,28,20);oled_draw_frame(x_board+2,40,24,10);oled_draw_box(x_board+2,40,2,10);
    oled_draw_pixel(x_board+25,51);oled_draw_pixel(x_board+25,53);oled_draw_pixel(x_board+25,55);
    oled_draw_box(x_board+21,51,3,2);oled_draw_box(x_board+21,54,3,2);oled_draw_box(x_board+17,53,3,3);
    oled_draw_box(x_board+12,53,4,3);oled_draw_box(x_board+7,53,4,3);oled_draw_box(x_board+2,53,4,3);
    oled_draw_box(x_board+7,y_wire_1,4,3);oled_draw_V_line(x_board+9,y_wire_1+3,3);oled_draw_V_line(x_board+8,y_wire_1+6,2);
    oled_draw_box(x_board+12,y_wire_2,4,3);oled_draw_V_line(x_board+14,y_wire_2+3,3);oled_draw_V_line(x_board+15,y_wire_2+6,2);
    if(time>300) about_move(&y_logo,15,94);
    if(time>350) about_move(&y_version,14,88);
    if(time>400) about_move(&y_box,2,92);
    if(time>450) about_move(&y_astra,36,91);
    if(time>500) about_move(&y_name,62,94);
    if(time>550) about_move(&x_board,102,92);
    if(time>620) about_move(&y_wire_1,56,86);
    if((time>1400&&time<1600)||(time>1800&&time<1900)||time>2200) oled_draw_box(x_board+5,42,19,6);
    if(time>2400) about_move(&y_wire_2,56,86);
}
