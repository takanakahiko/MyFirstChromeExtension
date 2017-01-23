document.write('<form name="loginForm" method="post" action="/campusp/sservice/login.do">\
  <h1>拓大ポータル 改</h1>\
  <input type="hidden" name="dispatch" value="login">\
  <input type="text" name="account" placeholder="Username"/>\
  <input type="password" name="password" placeholder="Password"/>\
  <button onclick="document.forms[0].submit();">Login</button>\
</form>');
