$('.mainMenu > li').click(function(){
    $(this).find('.subMenu').stop().slideDown()
});
$('.subMenu').mouseover(function(){
    $(this).stop().slideDown()
});
$('.mainMenu > li').mouseout(function(){
    $(this).find('.subMenu').stop().slideUp()
});

$(document).ready(function(){
    const slideDuration = 5000; // 이미지 전환 간격 (밀리초)
    const slideTransitionDuration = 1000; // 슬라이드 전환 애니메이션 지속 시간 (밀리초)
    
    // 이미지 슬라이드의 너비를 구합니다.
    const slideWidth = $('.imgSlide').width();
    
    // 처음에 첫 번째 이미지를 보여줍니다.
    $('.imgSlide > a:gt(0)').css({'left': slideWidth});
    
    // 이미지를 일정한 간격으로 전환합니다.
    setInterval(function(){
        $('.imgSlide > a:first-child')
        .animate({'left': -slideWidth}, slideTransitionDuration, function() {
            // 첫 번째 이미지를 화면 왼쪽으로 이동하여 페이드아웃 후, 맨 뒤로 이동시킵니다.
            $(this).css({'left': slideWidth}).appendTo('.imgSlide');
        })
        .next('a')
        .css({'left': slideWidth, 'opacity': '0'}) // 다음 이미지를 오른쪽에 위치시키고 투명하게 설정합니다.
        .animate({'left': 0, 'opacity': '1'}, slideTransitionDuration); // 다음 이미지를 왼쪽으로 이동하면서 페이드인합니다.
    }, slideDuration);
});

$(document).ready(function(){
    // 외화 정보를 보여줄 기본 리스트
    $('#exchangeRatePrices').show();
    // 주식 정보를 숨김
    $('#stockPrices').hide();

    // 외화 거래 바로가기 버튼 클릭 시
    $('#showExchangeRate').click(function(){
        // 외화 정보를 보여주고
        $('#exchangeRatePrices').show();
        // 주식 정보를 숨김
        $('#stockPrices').hide();
        // 활성화된 버튼의 배경색 변경
        $('#showExchangeRate').css('background-color', '#c0c0c0');
        // 비활성화된 버튼의 배경색 변경
        $('#showStockPrices').css('background-color', '#f0f0f0');
    });

    // 주식 거래 바로가기 버튼 클릭 시
    $('#showStockPrices').click(function(){
        // 주식 정보를 보여주고
        $('#stockPrices').show();
        // 외화 정보를 숨김
        $('#exchangeRatePrices').hide();
        // 활성화된 버튼의 배경색 변경
        $('#showStockPrices').css('background-color', '#c0c0c0');
        // 비활성화된 버튼의 배경색 변경
        $('#showExchangeRate').css('background-color', '#f0f0f0');
    });
});

