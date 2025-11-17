import { View } from "@react-pdf/renderer";
import {
  ResumePDFSection,
  ResumePDFBulletList,
} from "../ResumePDF/common";
import { styles } from "../ResumePDF/styles";
import type { ResumeCustom } from "../../../lib/redux/types";

export const ResumePDFCustom = ({
  heading,
  custom,
  themeColor,
  showBulletPoints,
}: {
  heading: string;
  custom: ResumeCustom;
  themeColor: string;
  showBulletPoints: boolean;
}) => {
  const { descriptions } = custom;

  return (
    <ResumePDFSection themeColor={themeColor} heading={heading}>
      <View style={{ ...styles.flexCol }}>
        <ResumePDFBulletList
          items={descriptions}
          showBulletPoints={showBulletPoints}
        />
      </View>
    </ResumePDFSection>
  );
};
