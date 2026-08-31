import { MigrationInterface } from 'typeorm';

/**
 * 마이그레이션 도입 시점의 baseline 마커 - 실제 DDL은 없다.
 *
 * migration:generate가 처음 만들어낸 원본은 up()에 인덱스/코멘트 스트립,
 * SQ_INQUIRY.CONFIDENCE/MATCHED_ARGS/MATCHED_FUNCTION DROP COLUMN, 새 FK
 * 제약 추가 등 50개 이상의 파괴적인 문을 담고 있었다 - 지금까지 엔티티에
 * @Index/@Unique/comment/FK 관계 옵션을 선언한 적이 없어서, DB에는 있지만
 * 엔티티에 없는 메타데이터를 전부 "지워야 할 것"으로, @ManyToOne이 암시하는
 * FK를 "추가해야 할 것"으로 해석한 결과였다. 실제로 실행했다면 인덱스/유니크
 * 제약이 사라지고, 컬럼 코멘트가 전부 날아가고, 아직 DROP하지 않기로 한
 * 컬럼(CONFIDENCE 등)과 엔티티에 없던 컬럼(SQ_QUIZ_SONG.YTB_THUMB_IMG_URL,
 * 데이터가 있었다면 유실)이 지워지고, 검증된 적 없는 FK 제약이 새로 걸릴
 * 뻔했다.
 *
 * 그래서 이 마이그레이션은 "여기서부터 마이그레이션으로 이력을 추적한다"는
 * 표시만 남기고 실제로는 아무것도 하지 않는다. 인덱스/코멘트/FK를 엔티티에
 * 온전히 선언하는 작업과 CONFIDENCE 등 컬럼 DROP은 각각 별도의 의도적인
 * 후속 마이그레이션으로 진행한다.
 */
export class InitialBaseline1788182355318 implements MigrationInterface {
  name = 'InitialBaseline1788182355318';

  public async up(): Promise<void> {
    // no-op - 위 설명 참고
  }

  public async down(): Promise<void> {
    // no-op - 위 설명 참고
  }
}
