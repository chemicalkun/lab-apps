/* Offline help for the exact methods and basis sets exposed by this application. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),app=window.MoleculeDFT;
  const sources={
    scf:['PySCF：SCF / Hartree–Fock','https://pyscf.org/user/scf.html'],
    dft:['PySCF：DFTと汎関数','https://pyscf.org/user/dft.html'],
    basis:['PySCF：基底関数とECP','https://pyscf.org/user/gto.html'],
    bse:['Basis Set Exchange：基底データと原論文','https://www.basissetexchange.org/'],
    def2:['Weigend & Ahlrichs (2005)：def2基底','https://doi.org/10.1039/B508541A'],
    pbe0:['PySCF：PBE0の定義','https://github.com/pyscf/pyscf/blob/master/pyscf/dft/xcfun.py']
  };
  const pages=[
    {id:'guide',group:'はじめに',title:'計算法と基底関数の選び方',tag:'2つの設定を分けて考える',body:[
      ['計算法は「電子の相互作用をどう近似するか」','HF、B3LYP、PBE、PBE0が該当します。基底関数は「軌道をどんな関数の組み合わせで表すか」です。同じ計算法でも基底を変えると、エネルギー・構造・計算量が変わります。'],
      ['まず小さい分子・短い鎖で確認','操作確認には小さなSTO-3Gが使えます。性質を検討する段階では、分極関数を含むdef2-SVPなどでも比較し、対象の性質が計算法・基底・配座・鎖長にどれだけ依存するか確認してください。このアプリの選択肢だけで基底極限への収束を保証できるわけではありません。'],
      ['比較する条件をそろえる','配座の安定性は、同じ組成・電荷・多重度・計算法・基底で求めたエネルギー差で比較します。異なる計算法の絶対エネルギーを並べて「より負だから高精度」と判断しないでください。鎖長が違う分子の全エネルギーも、そのまま安定性の順位にできません。'],
      ['計算前チェックも併用','実際の原子数・電子数・基底関数数は「計算前チェック」で確認できます。基底関数数が増えるとメモリと時間も増えますが、何倍かは手法・収束・分子・実行環境に依存します。']
    ],refs:['scf','dft','basis']},
    {id:'HF',group:'計算法',title:'HF — Hartree–Fock',tag:'波動関数法 / 分子軌道法',body:[
      ['何を計算する？','1つのスレーター行列式で電子状態を近似し、各電子が他の電子から受ける平均的な場の中で分子軌道を求めます。HF交換を含みますが、HFを超える電子相関は含みません。'],
      ['使いどころと限界','分子軌道や平均場近似を学ぶ際、またDFTとの比較に使えます。電子相関が重要な結合解離や分散相互作用の定量評価には不十分です。DFTの上位版でも、必ず高速な方法でもありません。'],
      ['このアプリでの実行','多重度1はRHF、それ以外はUHFです。UHFはα・β電子に別々の空間軌道を使います。開殻ではスピン汚染などに注意が必要です。開殻一重項を表す設定や、多配置法、MP2、CCSDはこの版にはありません。']
    ],refs:['scf']},
    {id:'B3LYP',group:'計算法',title:'B3LYP',tag:'ハイブリッドDFT / HF交換20%',body:[
      ['何を近似する？','交換・相関の近似汎関数とHF交換20%を組み合わせたハイブリッド汎関数です。電子相関を近似的に扱い、分子軌道も求めます。'],
      ['使いどころと限界','有機分子の構造や電子状態を調べる際の比較候補です。反応、電荷移動、結合解離などすべての現象で高精度とは限りません。通常のB3LYPには長距離の分散相互作用を適切に補う項がなく、高分子鎖の折り畳みや配座差の評価では注意が必要です。'],
      ['このアプリでの実行','PySCFのB3LYPエイリアスを使用します。多重度1はRKS、それ以外はUKSです。D3 / D4分散補正は付けていません。文献と比較する際は、B3LYPの実装・基底・補正の有無もそろえてください。']
    ],refs:['dft']},
    {id:'PBE',group:'計算法',title:'PBE',tag:'GGA型DFT / HF交換0%',body:[
      ['何を近似する？','電子密度とその空間的な勾配を使って交換・相関を近似するGGA汎関数です。HF交換は混ぜません。'],
      ['計算量と限界','HF交換が不要なため、同じ基底のハイブリッドDFTより計算負荷を抑えられる場合があります。ただし、実際の時間は収束性にも左右されます。電子の過度な非局在化や軌道ギャップの過小評価が問題になる場合があります。速度だけで手法を決めず、目的の性質で検証してください。'],
      ['このアプリでの実行','PBE交換とPBE相関を使用し、多重度1はRKS、それ以外はUKSです。分散補正は付けていません。周期境界条件によるバルク計算ではなく、描いた有限分子を計算します。']
    ],refs:['dft']},
    {id:'PBE0',group:'計算法',title:'PBE0',tag:'ハイブリッドDFT / HF交換25%',body:[
      ['PBEとの違い','PBE交換の25%をHF交換に置き換え、PBE相関と組み合わせます。交換部分はHF 25% + PBE 75%です。PBEとPBE0は別の計算法です。'],
      ['使いどころと限界','PBEやB3LYPとの比較で、構造・電荷分布・軌道エネルギーの手法依存性を調べられます。HF交換を計算する負荷が加わります。HF交換の割合が大きいほど常に正確になるわけではありません。'],
      ['このアプリでの実行','多重度1はRKS、それ以外はUKSです。分散補正は付けていません。PBE0でも長距離分散、強い電子相関、励起状態の問題が自動的に解決するわけではありません。']
    ],refs:['pbe0','dft']},
    {id:'sto-3g',group:'基底関数',title:'STO-3G',tag:'最小基底 / 水分子では7関数',body:[
      ['名前の意味','スレーター型軌道を3つのガウス型関数の線形結合で近似します。「3」は三重ゼータの意味ではありません。軌道の形を変える自由度が少ない最小基底です。'],
      ['向いている用途','操作の練習、計算経路の確認、小さなモデルでの試行に使えます。小さいため計算を始めやすい一方、結合・電荷分布などの柔軟な表現には制約があります。'],
      ['結果の扱い','この基底だけで得た数値を定量的な最終結果とせず、より柔軟な基底との違いを確認してください。追加の分極関数・拡散関数は含みません。']
    ],refs:['basis','bse']},
    {id:'6-31g',group:'基底関数',title:'6-31G',tag:'分割原子価・二重ゼータ / 水分子では13関数',body:[
      ['名前の意味','代表的なPople型基底です。炭素などでは内殻を6つの原始ガウス関数の縮約で表し、原子価殻を3つの縮約と1つの関数の2組に分けます。STO-3Gより原子価軌道の広がりを柔軟に表現できます。水素に内殻はありません。'],
      ['分極・拡散関数は別の追加','ここで選べるのは記号が付かない6-31Gです。6-31G(d)、6-31G*、6-31+G(d)とは異なり、追加の分極関数や拡散関数を含みません。'],
      ['結果の扱い','最小基底からの変化を確認できますが、結合による電子雲の変形や陰イオンなどの広がった電子分布には限界があります。名前が似た別の基底で計算した文献値と混同しないでください。']
    ],refs:['basis','bse']},
    {id:'def2-svp',group:'基底関数',title:'def2-SVP',tag:'分極付き分割原子価・二重ゼータ / 水分子では24関数',body:[
      ['SVPの意味','split valence + polarization。原子価軌道を複数の関数で表し、さらに分極関数で結合方向に応じた電子雲の変形を表しやすくします。たとえば炭素・酸素にはd型、水素にはp型の関数が加わります。'],
      ['使いどころと限界','このアプリでは、分極関数を含む基底で構造や電子状態を検討する選択肢です。STO-3Gや6-31Gより関数が多くなる場合があり、計算負荷も増えます。二重ゼータであり、基底極限ではありません。追加の拡散関数は含みません。'],
      ['ヨウ素とECP','このアプリはヨウ素にdef2の有効内殻ポテンシャル（ECP）を併用し、28個の内殻電子を明示的な電子計算から置き換えます。他の基底を使った全電子計算と、絶対エネルギーや電子数を単純に比較しないでください。']
    ],refs:['basis','def2','bse']},
    {id:'6-31g(d)',group:'基底関数',title:'6-31G(d)',tag:'重原子に分極関数 / 水分子では18関数',body:[
      ['6-31Gとの違い','6-31Gに重原子の分極関数を追加します。炭素や酸素ではd型関数が入り、結合方向に応じた電子雲の変形を表現しやすくします。6-31G*とも表記されます。'],
      ['含まれないもの','水素のp型分極関数や拡散関数は含みません。6-31G(d,p)や6-31+G(d)とは異なります。'],
      ['比較時の設定','このアプリのPySCFは球面調和関数（5D）を使用します。他の計算ソフトの6D設定とは関数数・結果が変わるため、基底名だけでなく設定も確認してください。']
    ],refs:['basis','bse']},
    {id:'6-31+g(d)',group:'基底関数',title:'6-31+G(d)',tag:'重原子に分極・拡散関数 / 水分子では22関数',body:[
      ['＋の意味','6-31G(d)に重原子の拡散関数を追加します。核から遠くまで広がる電子密度を表す自由度が増え、陰イオンなどで基底依存性を調べる選択肢になります。'],
      ['水素への追加は別','＋は重原子への拡散関数です。水素の拡散関数も加える＋＋や、水素の分極関数も加える(d,p)とは異なります。この選択肢だけで全ての陰イオンや励起状態を十分に表現できるとは限りません。'],
      ['収束と計算量','関数が増えるため計算量が増えます。広がった基底では線形従属性やSCF収束にも注意し、計算前チェックと収束ログを確認してください。球面調和関数（5D）を使用します。']
    ],refs:['basis','bse']},
    {id:'def2-tzvp',group:'基底関数',title:'def2-TZVP',tag:'分極付き原子価三重ゼータ / 水分子では43関数',body:[
      ['def2-SVPからの拡張','原子価部分を三重ゼータで表し、分極関数も含むdef2系列の基底です。同じ計算法・同じ配座でdef2-SVPとの違いを比べ、基底への依存性を確認できます。'],
      ['計算量と限界','一般に関数数と計算負荷が増えます。重合度の大きい高分子では基底関数1200個の上限に早く達するため、計算前チェックを使ってください。拡散関数を追加した基底ではなく、基底極限でもありません。'],
      ['ヨウ素','def2-SVPと同様、ヨウ素には28電子のdef2 ECPを併用します。全電子基底との絶対エネルギーの比較には注意してください。']
    ],refs:['basis','def2','bse']},
    {id:'terms',group:'読み解く',title:'MO・分極・拡散・収束とは',tag:'用語と結果の読み方',body:[
      ['DFTでも分子軌道を使う？','はい。HFは波動関数法、ここで使うDFTはKohn–Sham系の方法で、どちらも軌道を求めます。相互作用の近似とエネルギーの定義が異なります。ハイブリッドDFTはHF交換の一部も用います。'],
      ['分極関数と拡散関数','分極関数は電子雲の角度方向の変形を表す自由度を増やします。拡散関数は核から遠い領域を表しやすくする緩やかな関数で、陰イオンや広がった電子状態で重要です。6-31+G(d)は重原子の拡散関数を含みますが、水素の拡散関数は含みません。'],
      ['SCF収束と構造最適化','SCFは軌道と電子密度が自己整合するまでの反復です。構造最適化は、その計算を繰り返しながら原子位置を調整します。SCFの収束と最適化の収束は別で、最適化が収束しても大域的な最安定構造とは限りません。「構造最適化 ＋ 振動解析」では虚振動の有無を確認できます。虚振動がないことは大域的な最低エネルギー構造の保証ではありません。'],
      ['HOMO / LUMO・電荷','HOMOは最高被占軌道、LUMOは最低空軌道です。軌道ギャップを光学励起エネルギーやバルクのバンドギャップと同一視しないでください。Mulliken電荷は電子密度の分配方法の一つで、基底に強く依存する場合があります。']
    ],refs:['scf','dft','basis']},
    {id:'polymer',group:'読み解く',title:'高分子を計算するとき',tag:'有限鎖・配座・モデルの限界',body:[
      ['何のモデルを計算している？','繰り返し単位を指定数だけ連結し、末端を終端した1本の有限鎖を計算します。周期的に無限に続く高分子、結晶、溶融体、分子量分布やGPCの直接シミュレーションではありません。'],
      ['鎖長と末端','短い鎖では末端の影響が大きくなります。目的の性質が鎖長や末端基でどれくらい変わるか比較してください。原子数・基底関数数の上限は計算前チェックで確認できます。'],
      ['配座は1つに決まらない','配座探索の力場エネルギーとHF / DFTのエネルギーは異なります。複数候補を同じ量子化学条件で計算し、必要に応じてそれぞれ最適化します。この版は温度に応じた配座分布や自由エネルギーを算出しません。'],
      ['この版に含まれない効果','D3 / D4などの分散補正、溶媒効果、振動・熱補正、励起状態、周期境界条件は未実装です。特に鎖内・鎖間の非共有結合相互作用や折り畳みの定量評価では、これらの有無を検討してください。']
    ],refs:['dft']},
    {id:'drawing',group:'操作',title:'構造を速く描く',tag:'描く → 選ぶ → 整える',body:[
      ['溶媒と分散補正','計算環境から水・THF・トルエン・クロロホルム・DMSOのIEF-PCMを選べます。連続誘電体による静電効果で、個々の溶媒分子や非静電項は含みません。全エネルギー差は溶媒和自由エネルギーではありません。DFTではD3(BJ)の二体分散補正を併用でき、構造最適化・振動解析にも反映します。ATM三体項は含みません。'],
      ['自作ライブラリと末端','範囲選択した構造を右クリックしてライブラリに保存できます。名前、繰り返し単位の両接続点、末端として使う接続原子を指定してください。左のライブラリから再利用・編集・JSON書き出しができます。高分子の左右の末端はH・CH₃・OH・NH₂・OCOCH₃（–O–C(=O)–CH₃）・保存した原子団から選べます。PEGプリセットはOH/OHのみです。'],
      ['振動解析','計算の種類で「構造最適化 ＋ 振動解析」を選びます。同じ計算法・基底で最適化とHessian計算を行い、並進・回転を除いた振動数を表示します。iは虚振動です。虚振動がある場合は極小とは判定できません。虚振動がなくても大域的な最低エネルギー構造とは限りません。現在は閉殻一重項・水素込み2〜50原子・ヨウ素なしに対応。未スケーリングの調和近似で、IR強度・エントロピー・自由エネルギーは未実装です。結果のモードを選んで「3Dで再生」で変位を確認できます。振幅・速度は表示用で、虚振動の往復表示も実際の周期運動ではありません。虚振動がない場合にZPEを表示します。'],
      ['構造と画像のコピー','枠で原子を選択してコピー（⌘C）すると、編集用の構造データと背景が透明な構造式画像を同時にコピーします。このアプリに貼り付け（⌘V）ると編集可能な構造、PowerPointなどには画像として貼り付けられます。画像には選択の光やキャンバスの背景・操作ボタンは含まれません。'],
      ['クリック前の対象確認','原子にマウスを重ねると、その原子が光ります。クリックするまで分子や選択は変わりません。描画を解除した移動専用の状態では、この表示は出ません。'],
      ['描画領域を広げる','分子式の下、計算結果との境界にある取っ手を上下にドラッグします。下へ動かすと描画領域が広がります。高さは記憶されます。ダブルクリックで標準の高さに戻せます。境界にフォーカスして上下キーでも調整できます。'],
      ['選択表示・解除・移動','選択中の描画ツール・元素・原子団は緑色に光ります。キャンバス上で選択した原子にも光る輪を表示します。同じツールをもう一度押すと描画を解除し、ドラッグでキャンバスを移動できます。この状態では原子の上からドラッグしても分子座標は変わりません。原子団は名前ボタンで選択・解除、右の▾で一覧を開きます。一覧で同じ項目を選び直しても解除できます。描画を再開するにはツールを選択してください。'],
      ['結合を伸ばす','結合ツールで原子をクリックすると、周囲と重なりにくい方向に一定長の結合を追加します。ドラッグすると30°刻みで方向を指定でき、⌥を押しながらなら自由な角度にできます。既存原子へドラッグすると結合します。結合の上で1 / 2 / 3を押すと次数を変更できます。'],
      ['選ぶ・複製する','「囲んで選択」またはVで選択ツール。空白からドラッグで範囲選択、Shiftで追加します。結合を描いているときもShift + 空白からのドラッグで選択できます。結合をダブルクリック、または⌥を押しながら原子をダブルクリックすると、つながった分子全体を選択します。⌘Dで選択部分を右側に複製、⌘C / ⌘Vでコピー・貼り付けできます。複製直後は別の分子片なので、必要なら結合してください。'],
      ['選択した部分を繰り返し単位に','必要な原子を囲んで「選択部を単位に」を押します。図の原子を順にクリックしてA・Bを指定し、「2単位の接続を確認」で次の単位へのつながりを検証できます。A / Bの交換も可能です。省略された水素を接続時に置換するため、反応前のモノマーではなく、鎖中の単位内結合を描いてください。'],
      ['原子から環・原子団を伸ばす','五員環・六員環・環テンプレートを選んで既存の原子を押すと、その原子を共有して環を外側へ追加します（スピロ接続）。原子団テンプレートは、表示名の「−」側の原子から単結合で接続します。メトキシなら既存原子−O−CH₃です。青い丸が接続点です。原子価を超えると「結合過多」と表示されるので、計算前に結合や接続位置を修正してください。'],
      ['2原子を共有する環','原子を起点に環を回転し、隣の頂点を既存の頂点に近づけると辺に吸着します。青い2つの丸と「2原子共有」が目印です。離すと2原子とその間の結合を共有する縮合環になります。環ツールで既存の結合を押しても配置できます。別々に描いた環は、片方全体を選択して辺を近づけても共有できます。Optionで接近時の吸着を解除。元素・電荷の不一致、過剰原子価、既存の環への重なりがある場合は共有しません。'],
      ['配置するときの回転','環・原子団を選んで押したままドラッグし、離すと確定します。原子団は空白でも根元を固定して回転し、既存の原子上ではそこから伸びます。配置後も選択したツールを維持するので、続けて置けます。Bで結合ツール、Vで選択に戻ります。角度は接続方向（右0°、下90°、左180°、上270°）。空白への環配置は初期形状からの時計回り回転です。カーソルの近くに角度と水平・垂直を表示します。構造を横切る方向の補助線は表示しません。水平・垂直の5°以内に吸着し、Shiftで15°刻み、Optionで軸と近接辺への吸着を解除します。Escapeで配置を取り消せます。'],
      ['表示を動かす','「移動」またはGで表示移動ツールに切り替え、ドラッグします。どの描画ツールでも右ドラッグ、中央ボタン、Space + ドラッグで移動できます。分子の座標は変わりません。'],
      ['位置と向きを整える','選択部分をドラッグして移動。矢印キーは1単位、Shift + 矢印は10単位の微調整。[ / ]または回転ボタンで30°ずつ回転します。部分選択の移動・回転では、選択外との結合の形も変わります。⌘Zで取り消し、⇧⌘Zでやり直せます。'],
      ['元素・鎖・表示','原子にマウスを重ねてN、O、Clなどを入力すると元素を変更。原子をダブルクリックしても編集できます。Lでジグザグ鎖を描画。「自動整形」で結合長・角度を整え、「構造チェック」で原子価とR/Sを確認します。二本指スワイプ・Magic Mouse表面スワイプとSpace + ドラッグは表示移動。トラックパッドのピンチ、右下の＋・−は拡大縮小です。']
    ],refs:[]}
  ];
  const link=document.createElement('link');link.rel='stylesheet';link.href='calculation-help.css';document.head.append(link);
  const dialog=document.createElement('dialog');dialog.id='calculationHelp';dialog.setAttribute('aria-labelledby','calculationHelpTitle');
  dialog.innerHTML='<header class="guide-heading"><div><span class="eyebrow">MOLECULE DFT GUIDE</span><h2 id="calculationHelpTitle">計算と描画のヘルプ</h2></div><button class="button quiet" id="closeCalculationHelp" aria-label="ヘルプを閉じる">閉じる</button></header><div class="guide-layout"><aside class="guide-sidebar"><label for="calculationHelpSearch">項目を検索</label><input id="calculationHelpSearch" type="search" placeholder="例：相関、基底、回転" autocomplete="off"><nav id="calculationHelpNav" aria-label="ヘルプ項目"></nav><p id="guideSearchCount" role="status"></p></aside><article id="calculationHelpArticle" tabindex="0"></article></div>';
  document.body.append(dialog);let active='guide';
  function renderNav(){
    const query=$('calculationHelpSearch').value.trim().toLowerCase(),nav=$('calculationHelpNav');nav.replaceChildren();let group='';
    const found=pages.filter(p=>[p.title,p.tag,p.group,...p.body.flat()].join(' ').toLowerCase().includes(query));
    for(const p of found){if(p.group!==group){group=p.group;const label=document.createElement('p');label.className='guide-group';label.textContent=group;nav.append(label);}const button=document.createElement('button');button.textContent=p.title;button.dataset.page=p.id;button.setAttribute('aria-current',String(p.id===active));button.onclick=()=>showPage(p.id);nav.append(button);}
    $('guideSearchCount').textContent=query?(found.length?`${found.length} 件の項目`:'該当する項目がありません。別の言葉で検索してください。'):'';
  }
  function showPage(id){
    const p=pages.find(p=>p.id===id)||pages[0];active=p.id;const article=$('calculationHelpArticle');article.replaceChildren();
    const tag=document.createElement('p');tag.className='guide-tag';tag.textContent=p.tag;const title=document.createElement('h2');title.textContent=p.title;article.append(tag,title);
    for(const [heading,text] of p.body){const section=document.createElement('section'),h=document.createElement('h3'),body=document.createElement('p');h.textContent=heading;body.textContent=text;section.append(h,body);article.append(section);}
    if(p.group==='基底関数'){const note=document.createElement('p');note.className='guide-note';note.textContent='水分子の関数数は、このアプリのPySCF・球面調和関数の設定による例です。同じ基底でも分子の元素・原子数で関数数は変わります。';article.append(note);}
    if(p.refs.length){const refs=document.createElement('footer');refs.className='guide-sources';const heading=document.createElement('h3');heading.textContent='出典・さらに詳しく';refs.append(heading);for(const key of p.refs){const [label,url]=sources[key],a=document.createElement('a');a.href=url;a.textContent=label+' ↗';a.title='既定のブラウザで開きます（インターネット接続が必要）';a.onclick=event=>{event.preventDefault();app.native('openReference',{url}).catch(app.reportError);};refs.append(a);}article.append(refs);}
    article.scrollTop=0;renderNav();
  }
  function open(id='guide'){ $('calculationHelpSearch').value='';showPage(id);if(!dialog.open)dialog.showModal();$('calculationHelpArticle').focus(); }
  $('closeCalculationHelp').onclick=()=>dialog.close();$('calculationHelpSearch').oninput=renderNav;
  for(const [selectId,buttonId,label] of [['methodSelect','methodHelp','計算法の説明'],['basisSelect','basisHelp','基底関数の説明']]){
    const button=document.createElement('button');button.id=buttonId;button.className='setting-help';button.textContent='ⓘ '+label;button.onclick=()=>open($(selectId).value);$(selectId).after(button);
  }
  const entry=document.createElement('button');entry.id='calculationGuideButton';entry.className='button quiet';entry.textContent='計算法・基底関数・描画の詳しいヘルプ';entry.onclick=()=>{ $('helpDialog').close();open(); };$('helpDialog').querySelector('.help-content').prepend(entry);
  const drawHelp=document.createElement('button');drawHelp.id='drawingHelp';drawHelp.textContent='操作ガイド';drawHelp.onclick=()=>open('drawing');$('editorActions').querySelector('.editor-action-end').append(drawHelp);
  window.MoleculeDFTHelp={open,pages:pages.map(({id,title,group})=>({id,title,group}))};
})();
