$('.subMenu').hide();
$('nav').mouseover(function(){
    $(this.children('.subMenu')).stop().slideDown()
})
$('nav').mouseleave(function(){
    $('.subMenu').stop().slideUp()
})