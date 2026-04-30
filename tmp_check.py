with open('Alpha chess v1.9.35.html', encoding='utf-8') as f:
    txt = f.read()
old = '<span class="training-banner-label">\u2694 Mode entra\xeenement en cours</span>'
new = '<span class="training-banner-label">\u2694 Mode entra\xeenement \u2014 <span id="training-banner-label"></span></span>'

if old in txt:
    txt = txt.replace(old, new)
    with open('Alpha chess v1.9.35.html', 'w', encoding='utf-8') as f:
        f.write(txt)
    print('OK: replaced')
else:
    print('NOT FOUND, trying with repr search...')
    idx = txt.find('training-banner-label">')
    print(repr(txt[idx:idx+100]))
