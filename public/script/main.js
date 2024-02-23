$('.mainMenu > li').click(function(){
    $(this).find('.subMenu').stop().slideDown()
});
$('.subMenu').mouseover(function(){
    $(this).stop().slideDown()
});
$('.mainMenu > li').mouseout(function(){
    $(this).find('.subMenu').stop().slideUp()
});
